(() => {
  'use strict';
  const workspace = document.querySelector('[data-claude-workspace]');
  const dialog = document.getElementById('verificationSupportCheckout');
  const form = document.getElementById('verificationSupportCheckoutForm');
  const open = document.getElementById('claudeVerificationSubmit');
  if (!workspace || !dialog || !form || !open) return;
  const en = document.documentElement.lang === 'en';
  const status = form.querySelector('[data-support-payment-status]');
  const pay = form.querySelector('[data-support-pay]');
  const products = new Map();
  let current = null;
  const rub = value => Number(value).toLocaleString('ru-RU') + ' ₽';
  const selected = () => workspace.querySelector('[name="claude-verification"]:checked')?.value;
  fetch('/api/public/verification-support-products', { cache: 'no-store', credentials: 'same-origin' })
    .then(response => { if (!response.ok) throw new Error(); return response.json(); })
    .then(data => {
      for (const name of ['kyc', 'cvp']) {
        const product = data.items?.find(item => item.slug === `claude-${name}-support`);
        if (!product || product.currency !== 'RUB' || !(Number(product.price) > 0)) continue;
        products.set(name, product);
        workspace.dataset[name + 'Available'] = 'true';
        workspace.dataset[name + 'Price'] = String(product.price);
      }
      const product = products.get(selected());
      if (product) {
        document.getElementById('claudeVerificationPrice').textContent = rub(product.price);
        open.disabled = false;
      }
    }).catch(() => {});
  open.addEventListener('click', () => {
    current = products.get(selected());
    if (!current) return;
    status.textContent = '';
    dialog.querySelector('[data-support-name]').textContent = selected().toUpperCase();
    dialog.querySelector('[data-support-price]').textContent = rub(current.price);
    pay.textContent = (en ? 'Pay ' : 'Оплатить ') + rub(current.price);
    dialog.showModal();
  });
  dialog.querySelector('[data-support-close]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!current || pay.disabled || !form.reportValidity()) return;
    const email = form.elements.email.value.trim().toLowerCase();
    const telegram = form.elements.telegram.value.trim();
    const paymentMethod = form.elements.payment.value;
    pay.disabled = true;
    pay.setAttribute('aria-busy', 'true');
    status.textContent = en ? 'Creating payment…' : 'Создаём оплату…';
    const details = {
      source: 'verification_support_page', language: en ? 'en' : 'ru',
      selection: { serviceKey: 'verification-support', plan: selected().toUpperCase(), quantity: 1, paymentMethod },
      contact: { email, telegram },
    };
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(paymentMethod)}/create`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, product_slug: current.slug, quantity: 1, payment_method: paymentMethod, order_details: details }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.message || (en ? 'Could not create payment.' : 'Не удалось создать оплату.')));
      if (!data.pay_url) throw new Error(en ? 'Payment URL is missing.' : 'Не удалось получить ссылку на оплату.');
      const url = new URL(data.pay_url);
      if (url.protocol !== 'https:') throw new Error(en ? 'Invalid payment URL.' : 'Не удалось получить ссылку на оплату.');
      location.assign(url.href);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : (en ? 'Network error. Try again.' : 'Ошибка сети. Попробуйте ещё раз.');
      pay.disabled = false;
      pay.removeAttribute('aria-busy');
    }
  });
})();
