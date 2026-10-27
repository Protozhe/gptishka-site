(() => {
  const pass = document.querySelector('.launch-art--six-services .launch-pass');
  if (!pass) return;
  const art = pass.closest('.launch-art');
  const properties = ['left', 'top', 'width', 'height'];
  let frame = 0;

  function alignPass() {
    frame = 0;
    // Restore percentage geometry before measuring each new layout.
    properties.forEach(name => pass.style.removeProperty('--pass-pixel-' + name));
    const bounds = art.getBoundingClientRect();
    const style = getComputedStyle(pass);
    const ratio = window.devicePixelRatio || 1;
    const snap = value => Math.round(value * ratio) / ratio;
    const geometry = {
      left: snap(bounds.left + parseFloat(style.left)) - bounds.left,
      top: snap(bounds.top + parseFloat(style.top)) - bounds.top,
      width: snap(parseFloat(style.width)),
      height: snap(parseFloat(style.height))
    };
    properties.forEach(name => pass.style.setProperty('--pass-pixel-' + name, geometry[name] + 'px'));
  }

  function scheduleAlignment() {
    if (!frame) frame = requestAnimationFrame(alignPass);
  }

  if ('ResizeObserver' in window) new ResizeObserver(scheduleAlignment).observe(art);
  window.addEventListener('resize', scheduleAlignment, { passive: true });
  if (document.fonts) document.fonts.ready.then(scheduleAlignment);
  scheduleAlignment();
})();
