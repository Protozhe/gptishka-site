(() => {
  const heading = document.querySelector('.service-page[data-service-page="grok"] .service-constructor-brand h1');
  if (!heading) return;

  // The shared renderer uses the catalog title; the Grok page shows duration in its own control.
  const showPlanName = () => {
    const title = heading.textContent;
    const name = title.replace(/\s+[—–-]\s+1\s+(?:месяц|month)\s*$/iu, '');
    if (name !== title) heading.textContent = name;
  };

  new MutationObserver(showPlanName).observe(heading, { childList: true, characterData: true, subtree: true });
  showPlanName();
})();
