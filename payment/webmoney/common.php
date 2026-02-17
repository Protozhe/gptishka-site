<?php
declare(strict_types=1);

const WEBMONEY_MERCHANT_URL = 'https://merchant.webmoney.ru/lmi/payment.asp';
const WEBMONEY_DATA_DIR = __DIR__ . '/storage';
const WEBMONEY_ORDERS_FILE = WEBMONEY_DATA_DIR . '/orders.json';
const WEBMONEY_LOG_FILE = WEBMONEY_DATA_DIR . '/payments.log';

/**
 * Load and minimally validate merchant configuration.
 */
function wmConfig(): array
{
    $config = require __DIR__ . '/config.php';

    if (!is_array($config)) {
        throw new RuntimeException('Invalid config format.');
    }

    foreach (['purse', 'secret_key', 'test_mode'] as $key) {
        if (!array_key_exists($key, $config)) {
            throw new RuntimeException('Missing config key: ' . $key);
        }
    }

    if (!array_key_exists('additional_key', $config)) {
        $config['additional_key'] = '';
    }

    return $config;
}

/**
 * Ensure local storage exists for order state and logs.
 */
function wmEnsureStorage(): void
{
    if (!is_dir(WEBMONEY_DATA_DIR) && !mkdir(WEBMONEY_DATA_DIR, 0755, true) && !is_dir(WEBMONEY_DATA_DIR)) {
        throw new RuntimeException('Cannot create storage directory.');
    }

    if (!file_exists(WEBMONEY_ORDERS_FILE)) {
        $initial = ['orders' => []];
        file_put_contents(WEBMONEY_ORDERS_FILE, json_encode($initial, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }
}

/**
 * Basic scalar sanitization for external input.
 */
function wmSanitize(string $value): string
{
    $value = trim($value);
    return preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
}

/**
 * Validate and normalize money value to "0.00" style.
 */
function wmNormalizeAmount(string $raw): ?string
{
    $raw = wmSanitize($raw);

    if (!preg_match('/^\d{1,9}(\.\d{1,2})?$/', $raw)) {
        return null;
    }

    return number_format((float)$raw, 2, '.', '');
}

function wmBuildBaseUrl(): string
{
    $includesConfig = __DIR__ . '/../../includes/config.php';
    if (is_file($includesConfig)) {
      $rootConfig = require $includesConfig;
      if (is_array($rootConfig) && !empty($rootConfig['site_url'])) {
          return rtrim((string)$rootConfig['site_url'], '/');
      }
    }

    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((string)($_SERVER['SERVER_PORT'] ?? '') === '443');
    $scheme = $isHttps ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';

    return $scheme . '://' . $host;
}

function wmLog(string $event, array $context = []): void
{
    wmEnsureStorage();

    $line = [
        'time' => gmdate('c'),
        'event' => $event,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'context' => $context,
    ];

    file_put_contents(
        WEBMONEY_LOG_FILE,
        json_encode($line, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}

/**
 * Atomically update orders JSON and return callback result.
 */
function wmOrdersUpdate(callable $mutator): mixed
{
    wmEnsureStorage();
    $fp = fopen(WEBMONEY_ORDERS_FILE, 'c+');
    if ($fp === false) {
        throw new RuntimeException('Cannot open orders storage.');
    }

    try {
        if (!flock($fp, LOCK_EX)) {
            throw new RuntimeException('Cannot lock orders storage.');
        }

        $raw = stream_get_contents($fp);
        $state = $raw !== false && $raw !== '' ? json_decode($raw, true) : null;
        if (!is_array($state) || !isset($state['orders']) || !is_array($state['orders'])) {
            $state = ['orders' => []];
        }

        $result = $mutator($state);

        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);

        return $result;
    } finally {
        fclose($fp);
    }
}

function wmCreateOrder(string $amount, string $description): array
{
    $orderNo = (string)time() . random_int(1000, 9999);
    $order = [
        'order_no' => $orderNo,
        'amount' => $amount,
        'description' => $description,
        'status' => 'pending',
        'created_at' => gmdate('c'),
        'paid_at' => null,
        'transactions' => [],
    ];

    wmOrdersUpdate(static function (array &$state) use ($order): void {
        $state['orders'][$order['order_no']] = $order;
    });

    return $order;
}

function wmGetOrder(string $orderNo): ?array
{
    return wmOrdersUpdate(static function (array &$state) use ($orderNo): ?array {
        return $state['orders'][$orderNo] ?? null;
    });
}

/**
 * Idempotently mark order as paid and persist transaction metadata.
 */
function wmMarkOrderPaid(string $orderNo, string $transactionNo, array $paymentData): bool
{
    return wmOrdersUpdate(static function (array &$state) use ($orderNo, $transactionNo, $paymentData): bool {
        if (!isset($state['orders'][$orderNo])) {
            return false;
        }

        $order = &$state['orders'][$orderNo];
        if (!isset($order['transactions']) || !is_array($order['transactions'])) {
            $order['transactions'] = [];
        }

        if (in_array($transactionNo, $order['transactions'], true)) {
            // Duplicate callback for the same transaction.
            return true;
        }

        if (($order['status'] ?? 'pending') === 'paid') {
            // Already paid with another transaction: do not process twice.
            return false;
        }

        $order['status'] = 'paid';
        $order['paid_at'] = gmdate('c');
        $order['transactions'][] = $transactionNo;
        $order['payment'] = $paymentData;

        return true;
    });
}
