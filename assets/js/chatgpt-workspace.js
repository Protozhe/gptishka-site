(function () {
  'use strict';
  const workspace = document.querySelector('[data-chatgpt-workspace]');
  if (!workspace) return;
  const tabs = Array.from(workspace.querySelectorAll('[role="tab"]'));
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const defaultSection = workspace.dataset.defaultSection === 'credits' ? 'credits' : 'subscriptions';
  let incomingSection = ['#subscriptions', '#credits'].includes(location.hash) ? location.hash.slice(1) : '';
  // Section hashes select tabs. Temporarily consume an incoming hash so the
  // browser does not scroll to a panel before its layout and header are ready.
  if (incomingSection) history.replaceState(history.state, '', location.pathname + location.search);

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
    const selected = id === 'credits' ? 'credits' : 'subscriptions';
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
    document.querySelectorAll('.language-menu__option, [data-lang-switcher] .lang-item').forEach(link => {
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
    const section = location.hash.slice(1) || incomingSection;
    selectSection(section === 'credits' || section === 'subscriptions' ? section : defaultSection);
    if (tabs.includes(document.activeElement) && document.activeElement.getAttribute('aria-selected') !== 'true') {
      tabs.find(tab => tab.getAttribute('aria-selected') === 'true').focus({ preventScroll: true });
    }
  }
  const headerCredits = document.querySelector('.header-product-pill');
  headerCredits?.setAttribute('href', '#credits');
  headerCredits?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    selectSection('credits', true);
    document.getElementById('credits-tab').focus({ preventScroll: true });
    workspace.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  window.addEventListener('hashchange', restoreSection);
  window.addEventListener('popstate', restoreSection);
  restoreSection();

  // On a direct section link, keep the product title and tabs in view. Native
  // scrolling to a tab panel otherwise leaves its heading behind the header.
  if (incomingSection) {
    let readerInteracted = false;
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(type => {
      window.addEventListener(type, () => { readerInteracted = true; }, { once: true, passive: true });
    });
    window.addEventListener('load', () => {
      window.requestAnimationFrame(() => {
        const section = incomingSection;
        incomingSection = '';
        if (location.hash) return;
        history.replaceState(history.state, '', '#' + section);
        selectSection(section);
        if (readerInteracted) return;
        const header = document.querySelector('#storefrontHeader');
        const inset = (header ? header.offsetHeight : 0) + 16;
        window.scrollTo({ top: Math.max(0, workspace.getBoundingClientRect().top + window.scrollY - inset), behavior: 'instant' });
      });
    }, { once: true });
  }
})();
