/**
 * Project Management UI
 * Handles project selection, switching, and creation
 */

import { escapeHtml } from './utils.js';

let currentProject = null;
let allProjects = [];

/**
 * Initialize project management
 */
async function initializeProjects() {
  console.log('[Projects] Initializing project management');

  // Load projects and populate dropdown
  await loadProjects();

  // Set up event listener for project switching
  const selector = document.getElementById('project-selector');
  if (selector) {
    selector.addEventListener('change', async (e) => {
      const projectId = e.target.value;
      if (projectId && projectId !== currentProject?.id) {
        await switchProject(projectId);
      }
    });
  }

  // Set up path input listener for auto-populating project name (once)
  const pathInput = document.getElementById('new-project-path');
  const nameInput = document.getElementById('new-project-name');
  if (pathInput && nameInput) {
    pathInput.addEventListener('input', () => {
      const path = pathInput.value.trim();
      if (path) {
        // Extract folder name from path
        const folderName = path.split('/').filter(p => p).pop();
        if (folderName && !nameInput.value) {
          nameInput.value = folderName;
        }
      }
    });
  }
}

/**
 * Load projects from API and populate dropdown
 */
async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Failed to load projects');

    allProjects = await response.json();

    // Get current project
    const currentResponse = await fetch('/api/projects/current');
    if (currentResponse.ok) {
      currentProject = await currentResponse.json();
    }

    updateProjectDropdown();
  } catch (error) {
    console.error('[Projects] Failed to load projects:', error);
    // Show error in dropdown
    const selector = document.getElementById('project-selector');
    if (selector) {
      selector.innerHTML = '<option value="">Error loading projects</option>';
    }
  }
}

/**
 * Update the project dropdown with current projects
 */
function updateProjectDropdown() {
  const selector = document.getElementById('project-selector');
  if (!selector) return;

  // Clear existing options
  selector.innerHTML = '';

  if (allProjects.length === 0) {
    selector.innerHTML = '<option value="">No projects</option>';
    return;
  }

  // Add projects to dropdown
  allProjects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    option.selected = currentProject?.id === project.id;
    selector.appendChild(option);
  });
}

/**
 * Switch to a different project
 * @param {string} projectId - Project ID to switch to
 */
async function switchProject(projectId) {
  try {
    console.log(`[Projects] Switching to project: ${projectId}`);

    const response = await fetch(`/api/projects/${projectId}/set-current`, {
      method: 'POST'
    });

    if (!response.ok) throw new Error('Failed to switch project');

    currentProject = await response.json();
    console.log(`[Projects] Switched to: ${currentProject.name}`);

    // Update dropdown to show newly selected project
    updateProjectDropdown();

    // Refresh worktrees for new project
    await window.refreshWorktrees();

  } catch (error) {
    console.error('[Projects] Failed to switch project:', error);
    // Revert dropdown to current project
    updateProjectDropdown();
  }
}

/**
 * Show modal to create a new project
 */
async function showNewProjectModal() {
  const modal = document.getElementById('new-project-modal');
  if (!modal) {
    console.error('[Projects] New project modal not found');
    return;
  }

  // Clear form
  document.getElementById('new-project-name').value = '';
  document.getElementById('new-project-path').value = '';

  // Show modal first
  modal.classList.add('active');

  // Load suggested projects
  await loadSuggestedProjects();
}

/**
 * Close the new project modal
 */
function closeNewProjectModal() {
  const modal = document.getElementById('new-project-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Create a new project
 */
async function createProject() {
  const name = document.getElementById('new-project-name').value.trim();
  const path = document.getElementById('new-project-path').value.trim();

  if (!name || !path) {
    console.log('[Projects] Name and path required');
    return;
  }

  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, path })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create project');
    }

    const newProject = await response.json();
    console.log(`[Projects] Created project: ${newProject.name}`);

    // Reload projects and switch to new one
    await loadProjects();
    await switchProject(newProject.id);

    closeNewProjectModal();

  } catch (error) {
    console.error('[Projects] Failed to create project:', error);
    // Error logged to console - no popup
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeProjects);
} else {
  initializeProjects();
}

/**
 * Browse for a project directory using custom folder browser
 */
let currentBrowserPath = '';

async function browseForProjectPath() {
  const modal = document.getElementById('folder-browser-modal');
  if (!modal) {
    console.error('[Projects] Folder browser modal not found');
    return;
  }

  // Open modal and load home directory
  modal.classList.add('active');
  await loadFolderBrowserPath('');
}

/**
 * Load a directory in the folder browser
 * @param {string} path - Directory path to load
 */
async function loadFolderBrowserPath(path) {
  const list = document.getElementById('folder-browser-list');
  const pathDisplay = document.getElementById('folder-browser-current-path');

  if (!list || !pathDisplay) {
    console.error('[Projects] Folder browser elements not found');
    return;
  }

  // Show loading
  list.innerHTML = '<div class="folder-browser-loading">Loading...</div>';

  try {
    const response = await fetch('/api/system/browse-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });

    if (!response.ok) throw new Error('Failed to browse directory');

    const data = await response.json();
    currentBrowserPath = data.currentPath;
    pathDisplay.textContent = data.currentPath;

    // Build folder list - use data attributes to prevent XSS
    const folders = [];

    // Add parent directory if available
    if (data.parentPath) {
      folders.push(`
        <div class="folder-browser-item parent" data-path="${escapeHtml(data.parentPath)}">
          <i data-lucide="arrow-up" class="lucide-sm folder-icon"></i>
          <span class="folder-name">..</span>
        </div>
      `);
    }

    // Add subdirectories
    data.directories.forEach(dir => {
      const gitClass = dir.isGitRepo ? ' git-repo' : '';
      const gitBadge = dir.isGitRepo ? '<span class="git-badge">GIT</span>' : '';
      folders.push(`
        <div class="folder-browser-item${gitClass}" data-path="${escapeHtml(dir.path)}">
          <i data-lucide="${dir.isGitRepo ? 'folder-git-2' : 'folder'}" class="lucide-sm folder-icon"></i>
          <span class="folder-name">${escapeHtml(dir.name)}</span>
          ${gitBadge}
        </div>
      `);
    });

    list.innerHTML = folders.length > 0
      ? folders.join('')
      : '<div class="folder-browser-empty">No subdirectories</div>';

    // Attach click handlers safely via event delegation
    list.querySelectorAll('.folder-browser-item').forEach(item => {
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        if (path) loadFolderBrowserPath(path);
      });
    });

    // Reinitialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }

  } catch (error) {
    console.error('[Projects] Failed to browse directory:', error);
    list.innerHTML = '<div class="folder-browser-empty">Failed to load directory</div>';
  }
}

/**
 * Select the current folder in the browser
 */
function selectCurrentFolder() {
  if (!currentBrowserPath) {
    console.error('[Projects] No folder selected');
    return;
  }

  // Fill in the project path
  const pathInput = document.getElementById('new-project-path');
  const nameInput = document.getElementById('new-project-name');

  if (pathInput && nameInput) {
    pathInput.value = currentBrowserPath;
    const folderName = currentBrowserPath.split('/').filter(p => p).pop();
    nameInput.value = folderName;
  }

  closeFolderBrowser();
}

/**
 * Close the folder browser modal
 */
function closeFolderBrowser() {
  const modal = document.getElementById('folder-browser-modal');
  if (modal) {
    modal.classList.remove('active');
  }
  currentBrowserPath = '';
}

/**
 * Load suggested projects from common locations
 */
async function loadSuggestedProjects() {
  const container = document.getElementById('suggested-projects');
  const list = document.getElementById('suggested-projects-list');

  if (!container || !list) {
    console.error('[Projects] Suggested projects elements not found');
    return;
  }

  // Show loading state
  container.style.display = 'block';
  list.innerHTML = '<div class="suggested-projects-loading">Scanning for projects...</div>';

  try {
    const response = await fetch('/api/system/suggested-projects');
    if (!response.ok) throw new Error('Failed to load suggestions');

    const suggestions = await response.json();

    if (suggestions.length === 0) {
      list.innerHTML = '<div class="suggested-projects-empty">No git repositories found in common locations</div>';
      return;
    }

    // Render suggestions
    list.innerHTML = suggestions.map(project => `
      <div class="suggested-project-item" onclick="selectSuggestedProject('${escapeHtml(project.path)}', '${escapeHtml(project.name)}')">
        <i data-lucide="folder-git-2" class="lucide-sm folder-icon"></i>
        <div class="suggested-project-info">
          <div class="suggested-project-name">${escapeHtml(project.name)}</div>
          <div class="suggested-project-path">${escapeHtml(project.path)}</div>
        </div>
      </div>
    `).join('');

    // Reinitialize Lucide icons for the new elements
    if (window.lucide) {
      window.lucide.createIcons();
    }

  } catch (error) {
    console.error('[Projects] Failed to load suggested projects:', error);
    list.innerHTML = '<div class="suggested-projects-empty">Failed to load suggestions</div>';
  }
}

/**
 * Select a suggested project
 * @param {string} path - Full path to project
 * @param {string} name - Project name
 */
function selectSuggestedProject(path, name) {
  const pathInput = document.getElementById('new-project-path');
  const nameInput = document.getElementById('new-project-name');

  if (pathInput && nameInput) {
    pathInput.value = path;
    nameInput.value = name;
  }
}

/**
 * Remove the current project from VibeTrees
 * Note: Only removes from project list, does not delete files
 */
async function removeCurrentProject() {
  if (!currentProject) {
    console.log('[Projects] No project to remove');
    return;
  }

  const projectName = currentProject.name;

  try {
    const response = await fetch(`/api/projects/${currentProject.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove project');
    }

    console.log(`[Projects] Removed project: ${projectName}`);

    // Reload projects list
    await loadProjects();

    // If there are other projects, switch to the first one
    if (allProjects.length > 0) {
      await switchProject(allProjects[0].id);
    } else {
      // No projects left, clear worktrees
      currentProject = null;
      updateProjectDropdown();
    }

  } catch (error) {
    console.error('[Projects] Failed to remove project:', error);
    // Show error in console - no alert popups
  }
}

// Expose functions to global scope for onclick handlers
window.showNewProjectModal = showNewProjectModal;
window.closeNewProjectModal = closeNewProjectModal;
window.createProject = createProject;
window.browseForProjectPath = browseForProjectPath;
window.loadFolderBrowserPath = loadFolderBrowserPath;
window.selectCurrentFolder = selectCurrentFolder;
window.closeFolderBrowser = closeFolderBrowser;
window.selectSuggestedProject = selectSuggestedProject;
window.removeCurrentProject = removeCurrentProject;
