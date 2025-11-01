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
    alert(`Failed to switch project: ${error.message}`);

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
    alert('Please provide both name and path');
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
    alert(`Failed to create project: ${error.message}`);
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
 */
async function browseForProjectPath() {
  try {
    // Check if File System Access API is available (Chrome 86+)
    if ('showDirectoryPicker' in window) {
      // Use modern File System Access API
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read',
        startIn: 'documents'
      });

      // Send directory name to server to find matching path
      const response = await fetch('/api/system/find-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: dirHandle.name })
      });

      if (response.ok) {
        const { path } = await response.json();
        document.getElementById('new-project-path').value = path;
        document.getElementById('new-project-path').select();
      } else {
        // Fallback: show directory name and ask user to complete path
        const pathInput = document.getElementById('new-project-path');
        pathInput.value = dirHandle.name;
        pathInput.select();
        alert(`Selected directory: ${dirHandle.name}\n\nPlease verify or complete the full absolute path.`);
      }
    } else {
      // Fallback: Use hidden file input with directory selection (works in all modern browsers)
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

          if (response.ok) {
            const { path } = await response.json();
            pathInput.value = path;
            pathInput.select();
          } else {
            // Fallback: just use the name
            pathInput.value = dirName;
            pathInput.select();
            alert(`Selected: ${dirName}\n\nPlease enter the full absolute path.`);
          }
        }
        document.body.removeChild(input);
      };

      document.body.appendChild(input);
      input.click();
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[Projects] Directory selection cancelled');
    } else {
      console.error('[Projects] Error browsing for directory:', error);
      alert(`Error: ${error.message}\n\nPlease enter the path manually.`);
      document.getElementById('new-project-path').focus();
    }
  }
}

/**
 * Remove the current project from VibeTrees
 */
async function removeCurrentProject() {
  if (!currentProject) {
    alert('No project selected');
    return;
  }

  const projectName = currentProject.name;
  const confirmed = confirm(`Remove "${projectName}" from VibeTrees?\n\nThis only removes it from the project list. Your files will not be deleted.`);

  if (!confirmed) return;

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
    alert(`Failed to remove project: ${error.message}`);
  }
}

// Expose functions to global scope for onclick handlers
window.showNewProjectModal = showNewProjectModal;
window.closeNewProjectModal = closeNewProjectModal;
window.createProject = createProject;
window.browseForProjectPath = browseForProjectPath;
window.removeCurrentProject = removeCurrentProject;
