/**
 * Theme Management System
 *
 * Forces dark mode always. Light mode is for the weak.
 */

class ThemeManager {
  constructor() {
    this.init();
  }

  init() {
    // Force dark mode always
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

// Initialize theme manager
const themeManager = new ThemeManager();

// Export for use in other scripts
window.themeManager = themeManager;
