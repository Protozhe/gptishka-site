<?php
declare(strict_types=1);

require __DIR__ . '/common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method Not Allowed');
}

try {
    $config = wmConfig();
    wmEnsureStorage();

    $rawAmount = (string)($_POST['amount'] ?? '');
    $amount = wmNormalizeAmount($rawAmount);
    if ($amount === null) {
        wmLog('pay_invalid_amount', ['raw' => wmSanitize($rawAmount)]);
        http_response_code(400);
        exit('Invalid amount');
    }

    $description = wmSanitize((string)($_POST['description'] ?? 'Оплата заказа'));
    if ($description === '') {
        $description = 'Оплата заказа';
    }

    $order = wmCreateOrder($amount, $description);
    $baseUrl = wmBuildBaseUrl();

    $resultUrl = $baseUrl . '/payment/webmoney/result.php';
    $successUrl = $baseUrl . '/payment/webmoney/success.php?order_no=' . rawurlencode($order['order_no']);
    $failUrl = $baseUrl . '/payment/webmoney/fail.php?order_no=' . rawurlencode($order['order_no']);

    wmLog('pay_created', [
        'order_no' => $order['order_no'],
        'amount' => $amount,
    ]);
} catch (Throwable $e) {
    wmLog('pay_exception', ['message' => $e->getMessage()]);
    http_response_code(500);
    exit('Internal server error');
}
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Перенаправление в WebMoney</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f4f6fb; color: #151515; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { max-width: 520px; width: 100%; background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0 0 16px; line-height: 1.45; }
    .meta { margin: 0 0 18px; font-size: 14px; color: #555; }
    button { cursor: pointer; border: 0; border-radius: 10px; background: #0a7f3f; color: #fff; padding: 12px 16px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Перенаправляем в WebMoney</h1>
      <p>Сейчас вы будете перенаправлены для завершения оплаты.</p>
      <p class="meta">Order: <?php echo htmlspecialchars($order['order_no'], ENT_QUOTES, 'UTF-8'); ?> | Amount: <?php echo htmlspecialchars($amount, ENT_QUOTES, 'UTF-8'); ?></p>
      <form id="wm-pay-form" method="POST" action="<?php echo htmlspecialchars(WEBMONEY_MERCHANT_URL, ENT_QUOTES, 'UTF-8'); ?>">
        <input type="hidden" name="LMI_PAYMENT_AMOUNT" value="<?php echo htmlspecialchars($amount, ENT_QUOTES, 'UTF-8'); ?>">
        <input type="hidden" name="LMI_PAYMENT_NO" value="<?php echo htmlspecialchars($order['order_no'], ENT_QUOTES, 'UTF-8'); ?>">
        <input type="hidden" name="LMI_PAYEE_PURSE" value="<?php echo htmlspecialchars((string)$config['purse'], ENT_QUOTES, 'UTF-8'); ?>">
        <input type="hidden" name="LMI_PAYMENT_DESC" value="<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>">
        <input type="hidden" name="LMI_RESULT_URL" value="<?php echo htmlspecialchars($resultUrl, ENT_QUOTES, 'UTF-8'); ?>">
        <input type="hidden" name="LMI_SUCCESS_URL" value="<?php echo htmlspecialchars($successUrl, ENT_QUOTES, 'UTF-8'); ?>">
        <input type="hidden" name="LMI_FAIL_URL" value="<?php echo htmlspecialchars($failUrl, ENT_QUOTES, 'UTF-8'); ?>">
        <noscript><button type="submit">Перейти к оплате</button></noscript>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('wm-pay-form').submit();
  </script>
</body>
</html>
