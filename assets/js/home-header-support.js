(() => {
  const contact = document.querySelector('header .header-quick-link[href$="contact.html"]');
  if (!contact) return;
  const english = /^\/en(?:\/|$)/.test(location.pathname) || new URL(location.href).searchParams.get('lang') === 'en';
  contact.classList.add('header-support-link');
  contact.textContent = english ? 'Support' : 'Поддержка';
})();
