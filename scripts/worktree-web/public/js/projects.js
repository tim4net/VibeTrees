/**
 * Project Management UI
 * Handles project selection, switching, and creation
 */

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

    // Refresh worktrees for new project
    await refreshWorktrees();

  } catch (error) {
    console.error('[Projects] Failed to switch project:', error);
    // Revert dropdown to current project
    updateProjectDropdown();
  }
}

/**
 * Show modal to create a new project
 */
function showNewProjectModal() {
  const modal = document.getElementById('new-project-modal');
  if (!modal) {
    console.error('[Projects] New project modal not found');
    return;
  }

  // Clear form
  document.getElementById('new-project-name').value = '';
  document.getElementById('new-project-path').value = '';

  // Set up path input listener to auto-populate name
  const pathInput = document.getElementById('new-project-path');
  const nameInput = document.getElementById('new-project-name');

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

  modal.classList.add('active');
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
 * Browse for a project directory - opens native file picker
 * Uses simple file input method to avoid browser permission dialogs
 */
async function browseForProjectPath() {
  try {
    // Use hidden file input with directory selection
    // This method doesn't trigger "allow to copy" permission dialogs
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.directory = true;
    input.multiple = true;
    input.style.display = 'none';

    input.onchange = async (e) => {
      if (e.target.files.length > 0) {
        const firstFile = e.target.files[0];
        const relativePath = firstFile.webkitRelativePath || firstFile.name;
        const dirName = relativePath.split('/')[0];

        console.log('[Projects] Selected directory:', dirName);

        // Try to find full path on server
        const response = await fetch('/api/system/find-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: dirName })
        });

        const pathInput = document.getElementById('new-project-path');
        const nameInput = document.getElementById('new-project-name');

        if (response.ok) {
          const { path } = await response.json();
          pathInput.value = path;
          // Auto-populate name from folder
          const folderName = path.split('/').filter(p => p).pop();
          nameInput.value = folderName;
          pathInput.dispatchEvent(new Event('input'));
        } else {
          // Fallback: use directory name
          pathInput.value = dirName;
          nameInput.value = dirName;
          pathInput.select();
        }
      }
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  } catch (error) {
    console.error('[Projects] Error browsing for directory:', error);
    document.getElementById('new-project-path').focus();
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
window.removeCurrentProject = removeCurrentProject;
