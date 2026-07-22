(() => {
  const panel = document.querySelector('[data-design-lab]');
  if (!panel) return;

  const match = window.location.pathname.match(/^\/lab\/v([234])\/(.*)$/);
  const currentVersion = match ? `v${match[1]}` : null;
  let context = match ? match[2] : '';
  if (context === 'index.html') context = '';

  const suffix = `${window.location.search || ''}${window.location.hash || ''}`;
  panel.querySelectorAll('[data-lab-version]').forEach((link) => {
    const version = link.getAttribute('data-lab-version');
    const target = context ? `/lab/${version}/${context}` : `/lab/${version}/`;
    link.href = `${target}${suffix}`;
    if (version === currentVersion) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const collapse = () => {
    panel.classList.add('is-collapsed');
    sessionStorage.setItem('asmade-lab-controls', 'collapsed');
  };
  const expand = () => {
    panel.classList.remove('is-collapsed');
    sessionStorage.setItem('asmade-lab-controls', 'open');
  };

  panel.querySelector('[data-lab-hide]')?.addEventListener('click', collapse);
  panel.querySelector('[data-lab-restore]')?.addEventListener('click', expand);
  if (sessionStorage.getItem('asmade-lab-controls') === 'collapsed') collapse();

  document.addEventListener('keydown', (event) => {
    if (event.shiftKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      panel.classList.contains('is-collapsed') ? expand() : collapse();
    }
  });
})();