(function(){
  const STORAGE_KEY = 'irancash_theme';
  const root = document.documentElement;

  function getStoredTheme() {
    try { return localStorage.getItem(STORAGE_KEY); }
    catch (err) { return null; }
  }

  function storeTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); }
    catch (err) { /* ignore quota/security */ }
  }

  function currentTheme() {
    return root.dataset.theme || 'light';
  }

  function applyTheme(theme, persist = true) {
    root.dataset.theme = theme;
    if (persist) storeTheme(theme);
    refreshToggleButtons(theme);
  }

  function refreshToggleButtons(theme) {
    const isDark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(isDark));
      const label = btn.querySelector('[data-theme-toggle-label]');
      if (label) label.textContent = isDark ? 'Modo claro' : 'Modo escuro';
      const icon = btn.querySelector('[data-theme-toggle-icon]');
      if (icon) icon.innerHTML = isDark ? '&#9728;' : '&#9790;';
    });
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  function initButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      if (btn.dataset.themeToggleBound === 'true') return;
      btn.dataset.themeToggleBound = 'true';
      btn.addEventListener('click', toggleTheme);
    });
    refreshToggleButtons(currentTheme());
  }

  function handleSystemChange(event) {
    if (getStoredTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light', false);
  }

  function init() {
    initButtons();
    const query = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (query) {
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handleSystemChange);
      } else if (typeof query.addListener === 'function') {
        query.addListener(handleSystemChange);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


