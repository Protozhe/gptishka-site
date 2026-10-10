(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const orderId = params.get('order_id') || '';
  const orderToken = params.get('t') || '';
  const en = document.documentElement.lang === 'en';
  const status = document.getElementById('supportReceiptStatus');
  const details = document.getElementById('supportPaidDetails');
  const retry = document.getElementById('supportRetry');
  const contact = document.getElementById('supportContact');
  const copy = en ? {
    missing: 'Open the protected order link after payment or contact support.',
    loading: 'Checking payment…', pending: 'Payment is still being confirmed. This page will check again shortly.',
    failed: 'Could not open this order. Check your protected link or contact support.',
    wrong: 'This page is only for KYC or CVP verification orders.',
    paid: 'Payment confirmed.', network: 'Network error. Please check payment again.',
    draft: name => `Hello! I paid for ${name} verification. Order: ${orderId}. Please help me complete the order.`,
  } : {
    missing: 'Откройте защищённую ссылку на заказ после оплаты или обратитесь в поддержку.',
    loading: 'Проверяем оплату…', pending: 'Оплата ещё подтверждается. Страница проверит её повторно через несколько секунд.',
    failed: 'Не удалось открыть заказ. Проверьте защищённую ссылку или обратитесь в поддержку.',
    wrong: 'Эта страница доступна для заказов верификации KYC или CVP.',
    paid: 'Оплата подтверждена.', network: 'Ошибка сети. Проверьте оплату ещё раз.',
    draft: name => `Здравствуйте! Оплатил верификацию ${name}. Заказ: ${orderId}. Помогите, пожалуйста, завершить заказ.`,
  };
  let attempts = 0;
  let pending = false;
  let timer;
  async function loadOrder() {
    if (pending) return;
    clearTimeout(timer);
    details.hidden = true;
    contact.removeAttribute('href');
    retry.hidden = true;
    if (!orderId || !orderToken) { status.textContent = copy.missing; return; }
    document.getElementById('supportOrder').textContent = (en ? 'Order: ' : 'Заказ: ') + orderId;
    pending = true;
    attempts += 1;
    status.textContent = copy.loading;
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/activation?t=${encodeURIComponent(orderToken)}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        status.textContent = response.status === 409 ? copy.pending : copy.failed;
        retry.hidden = false;
        if (response.status === 409 && attempts < 12) timer = setTimeout(loadOrder, 4000);
        return;
      }
      if (data.deliveryMode !== 'verification_support' || !['claude-kyc-support', 'claude-cvp-support'].includes(data.productSlug) || data.status !== 'paid') {
        status.textContent = copy.wrong;
        return;
      }
      const name = data.productSlug === 'claude-kyc-support' ? 'KYC' : 'CVP';
      const url = new URL('https://t.me/gptishkasupport');
      url.searchParams.set('text', copy.draft(name));
      contact.href = url.href;
      document.getElementById('supportOrder').textContent += ' · ' + name;
      status.textContent = copy.paid;
      details.hidden = false;
    } catch {
      status.textContent = copy.network;
      retry.hidden = false;
    } finally { pending = false; }
  }
  document.querySelectorAll('.language-menu__option').forEach(link => {
    const url = new URL(link.href, location.href);
    url.search = location.search;
    link.href = url.href;
  });
  retry.addEventListener('click', () => { attempts = 0; loadOrder(); });
  loadOrder();
})();
