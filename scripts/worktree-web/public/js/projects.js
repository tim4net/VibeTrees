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

  modal.classList.add('open');
}

/**
 * Close the new project modal
 */
function closeNewProjectModal() {
  const modal = document.getElementById('new-project-modal');
  if (modal) {
    modal.classList.remove('open');
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

// Expose functions to global scope for onclick handlers
window.showNewProjectModal = showNewProjectModal;
window.closeNewProjectModal = closeNewProjectModal;
window.createProject = createProject;
