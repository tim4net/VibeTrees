/**
 * Theme Management System
 *
 * Handles dark/light mode toggling with:
 * - OS preference detection
 * - Manual override with localStorage persistence
 * - Smooth transitions
 */

class ThemeManager {
  constructor() {
    this.STORAGE_KEY = 'vibe-theme';
    this.themeToggle = null;
    this.init();
  }

  init() {
    // Load saved theme or detect OS preference
    this.loadTheme();

    // Create and insert theme toggle button
    this.createToggleButton();

    // Listen for OS theme changes
    this.watchSystemTheme();
  }

  /**
   * Get current theme (light/dark/auto)
   */
  getCurrentTheme() {
    return localStorage.getItem(this.STORAGE_KEY) || 'auto';
  }

  /**
   * Get effective theme (resolves 'auto' to actual theme)
   */
  getEffectiveTheme() {
    const saved = this.getCurrentTheme();
    if (saved === 'auto') {
      return this.getSystemTheme();
    }
    return saved;
  }

  /**
   * Get system theme preference
   */
  getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /**
   * Load theme from storage and apply
   */
  loadTheme() {
    const theme = this.getCurrentTheme();

    if (theme === 'auto') {
      // Remove data-theme attribute to use system preference
      document.documentElement.removeAttribute('data-theme');
    } else {
      // Set explicit theme
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  /**
   * Set theme (light/dark/auto)
   */
  setTheme(theme) {
    if (!['light', 'dark', 'auto'].includes(theme)) {
      console.error('Invalid theme:', theme);
      return;
    }

    localStorage.setItem(this.STORAGE_KEY, theme);
    this.loadTheme();
    this.updateToggleButton();
  }

  /**
   * Toggle theme (cycles through: auto → light → dark → auto)
   */
  toggleTheme() {
    const current = this.getCurrentTheme();
    const next = {
      'auto': 'light',
      'light': 'dark',
      'dark': 'auto'
    }[current];

    this.setTheme(next);
  }

  /**
   * Create theme toggle button
   */
  createToggleButton() {
    const button = document.createElement('button');
    button.className = 'theme-toggle';
    button.setAttribute('aria-label', 'Toggle theme');
    button.setAttribute('title', 'Toggle theme (Auto/Light/Dark)');

    button.addEventListener('click', () => this.toggleTheme());

    // Insert at top-right of page
    document.body.appendChild(button);
    this.themeToggle = button;

    this.updateToggleButton();
  }

  /**
   * Update toggle button text and icon
   */
  updateToggleButton() {
    if (!this.themeToggle) return;

    const theme = this.getCurrentTheme();
    const effective = this.getEffectiveTheme();

    const icons = {
      'auto': this.getAutoIcon(effective),
      'light': this.getLightIcon(),
      'dark': this.getDarkIcon()
    };

    const labels = {
      'auto': `Auto (${effective === 'dark' ? 'Dark' : 'Light'})`,
      'light': 'Light',
      'dark': 'Dark'
    };

    this.themeToggle.innerHTML = `
      ${icons[theme]}
      <span>${labels[theme]}</span>
    `;
  }

  /**
   * Watch for system theme changes
   */
  watchSystemTheme() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    mediaQuery.addEventListener('change', () => {
      // Only reload if in auto mode
      if (this.getCurrentTheme() === 'auto') {
        this.loadTheme();
        this.updateToggleButton();
      }
    });
  }

  /**
   * SVG Icons
   */
  getAutoIcon(effectiveTheme) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
      </svg>
    `;
  }

  getLightIcon() {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    `;
  }

  getDarkIcon() {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    `;
  }
}

// Initialize theme manager
const themeManager = new ThemeManager();

// Export for use in other scripts
window.themeManager = themeManager;
