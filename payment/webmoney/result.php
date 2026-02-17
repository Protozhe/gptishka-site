<?php
declare(strict_types=1);

require __DIR__ . '/common.php';

header('Content-Type: text/plain; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo 'NO';
    exit;
}

try {
    $config = wmConfig();
    wmEnsureStorage();

    $requiredFields = [
        'LMI_PAYEE_PURSE',
        'LMI_PAYMENT_AMOUNT',
        'LMI_PAYMENT_NO',
        'LMI_MODE',
        'LMI_SYS_INVS_NO',
        'LMI_SYS_TRANS_NO',
        'LMI_SYS_TRANS_DATE',
        'LMI_PAYER_PURSE',
        'LMI_PAYER_WM',
        'LMI_HASH',
    ];

    foreach ($requiredFields as $field) {
        if (!isset($_POST[$field])) {
            wmLog('result_missing_field', ['field' => $field]);
            echo 'NO';
            exit;
        }
    }

    $post = [];
    foreach ($requiredFields as $field) {
        $post[$field] = wmSanitize((string)$_POST[$field]);
    }

    $normalizedAmount = wmNormalizeAmount($post['LMI_PAYMENT_AMOUNT']);
    if ($normalizedAmount === null) {
        wmLog('result_invalid_amount', ['amount' => $post['LMI_PAYMENT_AMOUNT']]);
        echo 'NO';
        exit;
    }
    $post['LMI_PAYMENT_AMOUNT'] = $normalizedAmount;

    if (!preg_match('/^\d+$/', $post['LMI_PAYMENT_NO'])) {
        wmLog('result_invalid_order_no', ['order_no' => $post['LMI_PAYMENT_NO']]);
        echo 'NO';
        exit;
    }

    // Rebuild signature strictly in the official field order.
    $verificationKey = (string)($config['additional_key'] !== '' ? $config['additional_key'] : $config['secret_key']);

    $signatureRaw = $post['LMI_PAYEE_PURSE']
        . $post['LMI_PAYMENT_AMOUNT']
        . $post['LMI_PAYMENT_NO']
        . $post['LMI_MODE']
        . $post['LMI_SYS_INVS_NO']
        . $post['LMI_SYS_TRANS_NO']
        . $post['LMI_SYS_TRANS_DATE']
        . $verificationKey
        . $post['LMI_PAYER_PURSE']
        . $post['LMI_PAYER_WM'];

    $calculatedHash = strtoupper(md5($signatureRaw));
    $receivedHash = strtoupper($post['LMI_HASH']);

    if (!hash_equals($calculatedHash, $receivedHash)) {
        wmLog('result_bad_hash', [
            'order_no' => $post['LMI_PAYMENT_NO'],
            'received' => $receivedHash,
            'calculated' => $calculatedHash,
        ]);
        echo 'NO';
        exit;
    }

    if (!hash_equals((string)$config['purse'], $post['LMI_PAYEE_PURSE'])) {
        wmLog('result_bad_purse', [
            'order_no' => $post['LMI_PAYMENT_NO'],
            'received' => $post['LMI_PAYEE_PURSE'],
        ]);
        echo 'NO';
        exit;
    }

    if ($config['test_mode'] === false && $post['LMI_MODE'] === '1') {
        wmLog('result_test_payment_rejected', ['order_no' => $post['LMI_PAYMENT_NO']]);
        echo 'NO';
        exit;
    }

    $order = wmGetOrder($post['LMI_PAYMENT_NO']);
    if ($order === null) {
        wmLog('result_order_not_found', ['order_no' => $post['LMI_PAYMENT_NO']]);
        echo 'NO';
        exit;
    }

    $expectedAmount = wmNormalizeAmount((string)$order['amount']);
    if ($expectedAmount === null || !hash_equals($expectedAmount, $post['LMI_PAYMENT_AMOUNT'])) {
        wmLog('result_amount_mismatch', [
            'order_no' => $post['LMI_PAYMENT_NO'],
            'expected' => $expectedAmount,
            'received' => $post['LMI_PAYMENT_AMOUNT'],
        ]);
        echo 'NO';
        exit;
    }

    $marked = wmMarkOrderPaid(
        $post['LMI_PAYMENT_NO'],
        $post['LMI_SYS_TRANS_NO'],
        [
            'sys_invs_no' => $post['LMI_SYS_INVS_NO'],
            'sys_trans_no' => $post['LMI_SYS_TRANS_NO'],
            'sys_trans_date' => $post['LMI_SYS_TRANS_DATE'],
            'payer_purse' => $post['LMI_PAYER_PURSE'],
            'payer_wm' => $post['LMI_PAYER_WM'],
            'mode' => $post['LMI_MODE'],
        ]
    );

    if (!$marked) {
        wmLog('result_double_payment_blocked', [
            'order_no' => $post['LMI_PAYMENT_NO'],
            'transaction_no' => $post['LMI_SYS_TRANS_NO'],
        ]);
        echo 'NO';
        exit;
    }

    wmLog('result_paid', [
        'order_no' => $post['LMI_PAYMENT_NO'],
        'amount' => $post['LMI_PAYMENT_AMOUNT'],
        'transaction_no' => $post['LMI_SYS_TRANS_NO'],
    ]);

    // WebMoney expects exact "YES" on successful processing.
    echo 'YES';
} catch (Throwable $e) {
    wmLog('result_exception', ['message' => $e->getMessage()]);
    echo 'NO';
}
