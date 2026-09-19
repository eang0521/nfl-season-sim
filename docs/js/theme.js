// Shared light/dark theme toggle. The actual attribute is already applied
// by the inline anti-flash script in each page's <head> before this module
// even loads; this just wires up the button and keeps it in sync.

const STORAGE_KEY = 'nfl-sim-theme';

function storedTheme() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function setStoredTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
}

export function getEffectiveTheme() {
  const stored = storedTheme();
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateButtonLabel(button) {
  const theme = getEffectiveTheme();
  button.textContent = theme === 'dark' ? '☀️ Light' : '\u{1F319} Dark';
  button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

export function initThemeToggle(button) {
  updateButtonLabel(button);
  button.addEventListener('click', () => {
    const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setStoredTheme(next);
    updateButtonLabel(button);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  });
}
