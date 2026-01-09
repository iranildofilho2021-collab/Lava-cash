(() => {
  try {
    const STORAGE_KEY = 'irancash_theme';
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = initialTheme;
  } catch (err) {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme || 'light';
  }
})();
