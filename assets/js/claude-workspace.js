(function () {
  'use strict';
  const workspace = document.querySelector('[data-claude-workspace]');
  if (!workspace) return;
  const tabs = Array.from(workspace.querySelectorAll('[role="tab"]'));
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const defaultSection = workspace.dataset.defaultSection === 'verification' ? 'verification' : 'subscriptions';

  const accountAgeNotice = document.getElementById('claudeAccountAgeNotice');
  const plansGrid = workspace.querySelector('#servicePlansGrid');
  function updateAccountAgeNotice() {
    const planKey = plansGrid?.querySelector('.price-card')?.dataset.planKey || '';
    if (accountAgeNotice) accountAgeNotice.hidden = !planKey.startsWith('max-');
  }
  if (plansGrid) {
    new MutationObserver(updateAccountAgeNotice).observe(plansGrid, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['data-plan-key']
    });
    updateAccountAgeNotice();
  }

  // Both static and catalog-rendered questions start collapsed.
  const faq = workspace.querySelector('#faq');
  if (faq) {
    const initializedQuestions = new WeakSet();
    function initializeQuestions() {
      faq.querySelectorAll('.service-faq-item').forEach(item => {
        if (initializedQuestions.has(item)) return;
        initializedQuestions.add(item);
        item.classList.remove('active');
        item.querySelector('.service-faq-question')?.setAttribute('aria-expanded', 'false');
      });
    }
    initializeQuestions();
    new MutationObserver(() => {
      initializeQuestions();
      faq.querySelectorAll('.service-faq-item').forEach(item => {
        item.querySelector('.service-faq-question')?.setAttribute('aria-expanded',
          String(item.classList.contains('active')));
      });
    }).observe(faq, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  function selectSection(id, updateHistory = false) {
    const selected = id === 'verification' ? 'verification' : 'subscriptions';
    tabs.forEach((tab, index) => {
      const active = panels[index].id === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[index].hidden = !active;
    });
    workspace.dataset.section = selected;
    if (updateHistory && location.hash !== '#' + selected) {
      history.pushState(null, '', '#' + selected);
    }
    // Preserve the current section when switching the page language.
    document.querySelectorAll('.language-menu__option').forEach(link => {
      const url = new URL(link.href, location.href);
      url.hash = selected;
      link.href = url.href;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', event => {
      event.preventDefault();
      selectSection(panels[index].id, true);
    });
    tab.addEventListener('keydown', event => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectSection(panels[next].id, true);
      tabs[next].focus();
    });
  });

  function restoreSection() {
    const section = location.hash.slice(1);
    selectSection(section === 'verification' || section === 'subscriptions' ? section : defaultSection);
    if (tabs.includes(document.activeElement) && document.activeElement.getAttribute('aria-selected') !== 'true') {
      tabs.find(tab => tab.getAttribute('aria-selected') === 'true').focus({ preventScroll: true });
    }
  }
  const prices = { kyc: 6500, cvp: 11500 };
  workspace.querySelectorAll('[name="claude-verification"]').forEach(input => {
    input.addEventListener('change', () => {
      const amount = Number(workspace.dataset[input.value + 'Price'] || prices[input.value]);
      document.getElementById('claudeVerificationDetails').hidden = input.value !== 'kyc';
      document.getElementById('claudeVerificationPrice').textContent = amount.toLocaleString('ru-RU') + ' ₽';

      document.getElementById('claudeVerificationSubmit').disabled = !workspace.dataset[input.value + 'Available'];
      document.getElementById('claudeVerificationSubmit').textContent = (document.documentElement.lang === 'en' ? 'Order ' : 'Оформить ') + input.value.toUpperCase();
    });
  });
  window.addEventListener('hashchange', restoreSection);
  window.addEventListener('popstate', restoreSection);
  restoreSection();
})();
