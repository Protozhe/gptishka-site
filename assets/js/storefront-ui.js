/* Shared keyboard behavior for public storefront dialogs. */
(() => {
  'use strict';
  if (/^\/admin(?:\/|$)/.test(location.pathname)) return;
  const english = /^\/en(?:\/|$)/.test(location.pathname) || new URLSearchParams(location.search).get('lang') === 'en';
  const main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'storefrontMain';
    main.setAttribute('tabindex', '-1');
    const skip = document.createElement('a');
    skip.className = 'storefront-skip-link';
    skip.href = '#' + main.id;
    skip.textContent = english ? 'Skip to content' : 'Перейти к содержимому';
    skip.addEventListener('click', () => main.focus({preventScroll: true}));
    document.body.prepend(skip);
  }
  const roots = '.product-preview-modal, .chatgpt-onboarding-modal, #cartPaymentModal';
  const focusable = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  const openers = new WeakMap();
  const previousInert = new Map();
  let stack = [];
  let active = null;
  let scheduled = false;
  let lastTrigger = document.activeElement;
  document.addEventListener('click', event => {
    const root = event.target.closest(roots);
    if (!root || root === active) lastTrigger = document.activeElement;
  }, true);
  const visible = node => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0;
  const controls = node => Array.from(node.querySelectorAll(focusable)).filter(el => {
    if (el.disabled || el.closest('[hidden], [inert], [aria-hidden="true"]') || !el.getClientRects().length) return false;
    for (let parent = el.parentElement; parent && parent !== node; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open && el !== parent.querySelector(':scope > summary')) return false;
    }
    return true;
  });
  function sync() {
    scheduled = false;
    const opened = Array.from(document.querySelectorAll(roots)).filter(visible);
    for (const root of opened) {
      if (!stack.includes(root)) {
        openers.set(root, root.contains(document.activeElement) ? lastTrigger : document.activeElement);
        stack.push(root);
      }
      root.querySelectorAll('[data-chatgpt-go-error-for]').forEach(error => {
        const name = error.dataset.chatgptGoErrorFor;
        const field = root.querySelector('[name="' + CSS.escape(name) + '"]');
        if (!field) return;
        if (!error.id) error.id = root.id + '-error-' + name;
        const ids = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        ids.add(error.id);
        field.setAttribute('aria-describedby', Array.from(ids).join(' '));
        error.setAttribute('aria-live', 'polite');
      });
      root.querySelectorAll('[data-chatgpt-go-status], [data-chatgpt-go-promo-msg]').forEach(el => {
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
      });
    }
    stack = stack.filter(root => opened.includes(root));
    const next = stack.at(-1) || null;
    if (next === active) return;
    const closing = active;
    for (const [el, inert] of previousInert) el.inert = inert;
    previousInert.clear();
    active = next;
    const opener = closing && openers.get(closing);
    if (active) {
      for (const el of document.body.children) {
        if (el === active || el.contains(active) || ['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) continue;
        previousInert.set(el, el.inert);
        el.inert = true;
      }
      if (opener?.isConnected && active.contains(opener)) opener.focus({preventScroll: true});
      else if (!active.contains(document.activeElement)) controls(active)[0]?.focus({preventScroll: true});
    } else if (closing) {
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({preventScroll: true});
    }
  }
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') {
      // Use each component's own close handler so its state and drafts stay intact.
      const close = active.querySelector('[data-product-preview-close], [data-chatgpt-go-order-close], [data-onboarding-close], [data-claude-onboarding-close], [data-midjourney-onboarding-close], [data-suno-onboarding-close], [data-payment-modal-close]');
      if (close) { event.preventDefault(); event.stopPropagation(); close.click(); }
      return;
    }
    if (event.key !== 'Tab') return;
    const items = controls(active);
    if (!items.length) { event.preventDefault(); return; }
    const current = document.activeElement;
    if ((event.shiftKey && (current === items[0] || !items.includes(current))) || (!event.shiftKey && (current === items.at(-1) || !active.contains(current)))) {
      event.preventDefault();
      event.stopPropagation();
      (event.shiftKey ? items.at(-1) : items[0]).focus();
    }
  }, true);
  document.addEventListener('focusin', event => {
    const root = event.target.closest(roots);
    if (!root || root === active) lastTrigger = event.target;
    if (active && !active.contains(event.target)) controls(active)[0]?.focus({preventScroll: true});
  });
  new MutationObserver(() => {
    if (!scheduled) { scheduled = true; queueMicrotask(sync); }
  }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden']});
  sync();
})();
