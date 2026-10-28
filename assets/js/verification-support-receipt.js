(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const orderId = params.get('order_id') || '', orderToken = params.get('t') || '';
  const en = document.documentElement.lang === 'en', get = id => document.getElementById(id);
  const status = get('supportReceiptStatus'), details = get('supportPaidDetails');
  const form = get('supportLinkForm'), input = get('supportLink'), submit = get('supportLinkSubmit');
  const progress = get('supportProgress'), retry = get('supportRetry'), contact = get('supportContact');
  const copy = en ? {
    missing: 'Open the protected order link after payment or contact support.',
    loading: 'Checking payment…', pending: 'Payment is still being confirmed. We will check again shortly.',
    failed: 'Could not open this order. Check your protected link or contact support.',
    wrong: 'This page is only for KYC or CVP verification support orders.',
    network: 'Could not connect. Try again — your order is still saved.',
    ready: 'Payment confirmed', title: name => `Verification support · ${name}`,
    sending: 'Saving your link…', send: 'Send link', invalid: 'Paste the complete HTTPS verification link after Verify now → Start.',
    saveFailed: 'Could not save the link. Check it and try again or contact the manager.',
    received: 'Your order is in progress', done: 'Your order is complete',
    working: 'Your link has been received. Processing takes up to 24 hours.',
    finished: 'The manager has marked your order complete. Contact us if you have any questions.',
    late: 'Your order is still in progress. Contact the manager to check the completion time.',
    copied: 'Order page copied', copyFailed: 'Could not copy. Copy this page’s address from the address bar.',
    draft: name => `Hello! I have a ${name} verification support order: ${orderId}. Please help me with the next steps.`,
    cvpTitle: 'Prepare your CVP link', cvpText: 'Copy the personal link from your verification request. If you are unsure which link to use, ask the manager.',
    cvpSecond: 'Copy the full address', cvpSecondText: 'Copy the entire link, including all characters after the question mark.',
  } : {
    missing: 'Откройте защищённую ссылку на заказ после оплаты или обратитесь в поддержку.',
    loading: 'Проверяем оплату…', pending: 'Оплата ещё подтверждается. Проверим её повторно через несколько секунд.',
    failed: 'Не удалось открыть заказ. Проверьте защищённую ссылку или обратитесь в поддержку.',
    wrong: 'Эта страница доступна только для заказов сопровождения KYC или CVP.',
    network: 'Не удалось подключиться. Попробуйте ещё раз — ваш заказ сохранён.',
    ready: 'Оплата подтверждена', title: name => `Сопровождение верификации · ${name}`,
    sending: 'Сохраняем ссылку…', send: 'Отправить ссылку', invalid: 'Вставьте полную HTTPS-ссылку на проверку после Verify now → Start.',
    saveFailed: 'Не удалось сохранить ссылку. Проверьте её и попробуйте ещё раз или свяжитесь с менеджером.',
    received: 'Заказ выполняется', done: 'Заказ завершён',
    working: 'Ссылка получена. Обработка заказа — до 24 часов.',
    finished: 'Менеджер отметил заказ как завершённый. Если остались вопросы, напишите нам.',
    late: 'Заказ ещё в работе. Свяжитесь с менеджером, чтобы уточнить срок выполнения.',
    copied: 'Страница заказа скопирована', copyFailed: 'Не удалось скопировать. Скопируйте адрес страницы из адресной строки.',
    draft: name => `Здравствуйте! Мой заказ сопровождения ${name}: ${orderId}. Подскажите дальнейшие шаги.`,
    cvpTitle: 'Подготовьте ссылку для CVP', cvpText: 'Скопируйте персональную ссылку из запроса на проверку. Если не знаете, какую ссылку использовать, уточните у менеджера.',
    cvpSecond: 'Скопируйте полный адрес', cvpSecondText: 'Копируйте ссылку целиком, включая все символы после вопросительного знака.',
  };
  let attempts = 0, loading = false, saving = false, timer, currentState = '', editing = false;
  function message(text, error = false) {
    status.textContent = text; status.hidden = !text;
    status.classList.toggle('is-error', error);
  }
  function validLink(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 8192 || /\s/.test(raw)) return false;
    try {
      const url = new URL(raw), host = url.hostname.toLowerCase();
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && host.includes('.') &&
        host !== 'gptishka.shop' && !host.endsWith('.gptishka.shop') && !host.endsWith('.localhost') && !/^\d[\d.]*$/.test(host);
    } catch { return false; }
  }
  function render(data) {
    const name = ['claude-kyc-support', 'claude-kyc'].includes(data.productSlug) ? 'KYC' : 'CVP';
    get('supportTitle').textContent = copy.title(name);
    get('supportOrder').textContent = (en ? 'Order: ' : 'Заказ: ') + orderId;
    get('supportPaymentBadge').textContent = copy.ready;
    get('supportPaymentBadge').classList.add('is-paid');
    if (name === 'CVP') {
      get('supportStepOneTitle').textContent = copy.cvpTitle; get('supportStepOneText').textContent = copy.cvpText;
      get('supportStepTwoTitle').textContent = copy.cvpSecond; get('supportStepTwoText').textContent = copy.cvpSecondText;
      get('supportEntryIntro').textContent = en ? 'Paste the personal link from your verification request.' : 'Вставьте персональную ссылку из запроса на проверку.';
    }
    const url = new URL('https://t.me/gptishkasupport'); url.searchParams.set('text', copy.draft(name)); contact.href = url.href;
    details.hidden = false;
    currentState = data.supportState || 'awaiting_link';
    const active = currentState === 'processing' || currentState === 'completed', completed = currentState === 'completed';
    progress.hidden = !active; progress.classList.toggle('is-complete', completed);
    get('supportProgressTitle').textContent = completed ? copy.done : copy.received;
    const overdue = data.submittedAt && Date.now() - Date.parse(data.submittedAt) >= 24 * 60 * 60 * 1000;
    get('supportProgressText').textContent = completed ? copy.finished : overdue ? copy.late : copy.working;
    get('supportProgressTime').hidden = completed; get('supportReplaceLink').hidden = completed;
    form.hidden = completed || (active && !editing);
    get('supportTimeline').dataset.state = completed ? 'completed' : 'processing';
  }
  async function loadOrder() {
    if (loading || saving) return;
    clearTimeout(timer); retry.hidden = true;
    if (!orderId || !orderToken) { message(copy.missing, true); return; }
    loading = true; attempts += 1;
    if (!currentState) message(copy.loading);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/activation?t=${encodeURIComponent(orderToken)}`, { cache: 'no-store', credentials: 'same-origin', referrerPolicy: 'no-referrer' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if ([401, 403, 404, 409, 410].includes(response.status)) details.hidden = true;
        message(response.status === 409 ? copy.pending : copy.failed, true); retry.hidden = false;
        if (response.status === 409 && attempts < 12) timer = setTimeout(loadOrder, 4000);
        return;
      }
      if (data.deliveryMode !== 'verification_support' || !['claude-kyc-support', 'claude-cvp-support', 'claude-kyc', 'claude-cvp'].includes(data.productSlug) || data.status !== 'paid') {
        details.hidden = true; message(copy.wrong, true); return;
      }
      render(data); message('');
      if (currentState === 'processing') timer = setTimeout(loadOrder, 30000);
    } catch {
      message(copy.network, true); retry.hidden = false;
      if (currentState === 'processing') timer = setTimeout(loadOrder, 30000);
    } finally { loading = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !orderId || !orderToken || details.hidden || currentState === 'completed') return;
    const link = input.value.trim();
    if (!validLink(link)) { message(copy.invalid, true); input.focus(); return; }
    saving = true; clearTimeout(timer); submit.disabled = true; submit.setAttribute('aria-busy', 'true'); submit.textContent = copy.sending; message('');
    let accepted = false;
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/activation/store-token`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: link, orderToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) { message(copy.saveFailed, true); return; }
      input.value = ''; editing = false; accepted = true;
    } catch { message(copy.network, true); }
    finally { saving = false; submit.disabled = false; submit.removeAttribute('aria-busy'); submit.textContent = copy.send; }
    if (accepted) loadOrder();
  });
  get('supportReplaceLink').addEventListener('click', () => { editing = true; form.hidden = false; input.focus(); });
  get('supportRefresh').addEventListener('click', loadOrder);
  get('supportCopyOrder').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); message(copy.copied); }
    catch { message(copy.copyFailed, true); }
  });
  document.querySelectorAll('.language-menu__option').forEach(link => { const url = new URL(link.href, location.href); url.search = location.search; link.href = url.href; });
  retry.addEventListener('click', () => { attempts = 0; loadOrder(); });
  loadOrder();
})();
