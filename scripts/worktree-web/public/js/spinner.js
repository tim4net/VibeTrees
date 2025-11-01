// Spinner utility for showing loading states

let spinnerOverlay = null;

/**
 * Show a full-screen loading spinner with optional message
 * @param {string} message - Optional message to display
 * @returns {void}
 */
export function showSpinner(message = 'Loading...') {
  // Remove existing spinner if any
  hideSpinner();

  // Create spinner overlay
  spinnerOverlay = document.createElement('div');
  spinnerOverlay.className = 'spinner-overlay';
  spinnerOverlay.innerHTML = `
    <div class="spinner-container">
      <div class="spinner"></div>
      <div class="spinner-text">${message}</div>
    </div>
  `;

  document.body.appendChild(spinnerOverlay);
}

/**
 * Hide the loading spinner
 * @returns {void}
 */
export function hideSpinner() {
  if (spinnerOverlay) {
    spinnerOverlay.remove();
    spinnerOverlay = null;
  }
}

/**
 * Add loading state to a button
 * @param {HTMLButtonElement} button - Button element
 * @returns {void}
 */
export function setButtonLoading(button) {
  if (button) {
    button.classList.add('loading');
    button.disabled = true;
  }
}

/**
 * Remove loading state from a button
 * @param {HTMLButtonElement} button - Button element
 * @returns {void}
 */
export function unsetButtonLoading(button) {
  if (button) {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

/**
 * Wrap an async function with spinner display
 * @param {Function} fn - Async function to wrap
 * @param {string} message - Optional loading message
 * @returns {Function} Wrapped function
 */
export function withSpinner(fn, message = 'Loading...') {
  return async function(...args) {
    showSpinner(message);
    try {
      return await fn.apply(this, args);
    } finally {
      hideSpinner();
    }
  };
}
