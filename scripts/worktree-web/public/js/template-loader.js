/**
 * Template Loader
 * Loads HTML templates (modals, components) dynamically
 */

const TEMPLATE_CACHE = new Map();

/**
 * Load an HTML template and insert it into the DOM
 * @param {string} templatePath - Path to template file (e.g., 'modals/create-worktree.html')
 * @param {string} containerId - ID of container to insert template into (default: 'modals-container')
 * @returns {Promise<void>}
 */
async function loadTemplate(templatePath, containerId = 'modals-container') {
  // Check cache first
  if (TEMPLATE_CACHE.has(templatePath)) {
    const container = document.getElementById(containerId);
    if (container && !container.querySelector(`[data-template="${templatePath}"]`)) {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-template', templatePath);
      wrapper.innerHTML = TEMPLATE_CACHE.get(templatePath);
      container.appendChild(wrapper);
    }
    return;
  }

  try {
    const response = await fetch(`/templates/${templatePath}`);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templatePath} (${response.status})`);
    }

    const html = await response.text();
    TEMPLATE_CACHE.set(templatePath, html);

    // Insert into DOM
    const container = document.getElementById(containerId);
    if (container) {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-template', templatePath);
      wrapper.innerHTML = html;
      container.appendChild(wrapper);
    }
  } catch (error) {
    console.error(`Error loading template ${templatePath}:`, error);
    throw error;
  }
}

/**
 * Load multiple templates in parallel
 * @param {string[]} templatePaths - Array of template paths to load
 * @param {string} containerId - ID of container to insert templates into
 * @returns {Promise<void>}
 */
async function loadTemplates(templatePaths, containerId = 'modals-container') {
  await Promise.all(templatePaths.map(path => loadTemplate(path, containerId)));
}

/**
 * Preload all modal templates
 * Call this on page load to load all modals at once
 */
async function preloadModals() {
  const modalTemplates = [
    'modals/create-worktree.html',
    // Add other modals as they're extracted
  ];

  await loadTemplates(modalTemplates);
  console.log('✓ All modal templates loaded');
}
