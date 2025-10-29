/**
 * Service Startup Progress Modal
 * Shows real-time progress when starting Docker services
 */

/**
 * Show the service startup modal and start services
 * @param {string} worktreeName - Name of the worktree
 * @param {Object} ports - Discovered ports for services
 */
export async function showServiceStartupModal(worktreeName, ports) {
  const modal = document.getElementById('service-startup-modal');
  const header = document.getElementById('service-startup-header');
  const list = document.getElementById('service-startup-list');
  const logs = document.getElementById('service-startup-logs');
  const doneBtn = document.getElementById('service-startup-done-btn');
  const closeBtn = document.getElementById('service-startup-close');

  // Show modal
  modal.classList.add('active');
  header.textContent = `Starting services for ${worktreeName}...`;
  list.innerHTML = '';
  logs.innerHTML = '';
  logs.style.display = 'none';
  doneBtn.style.display = 'none';
  closeBtn.style.display = 'none';

  // Populate service list
  const services = Object.entries(ports);
  for (const [serviceName, port] of services) {
    const item = document.createElement('div');
    item.className = 'service-startup-item pending';
    item.setAttribute('data-service', serviceName);
    item.innerHTML = `
      <div class="service-status-icon"></div>
      <div class="service-name">${serviceName}</div>
      <div class="service-port">:${port}</div>
    `;
    list.appendChild(item);
  }

  // Start the services
  try {
    const response = await fetch(`/api/worktrees/${worktreeName}/services/start`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.success) {
      // Success - mark all services as completed
      header.textContent = 'All services started successfully!';

      // Animate each service starting (staggered)
      for (let i = 0; i < services.length; i++) {
        const [serviceName] = services[i];
        const item = list.querySelector(`[data-service="${serviceName}"]`);

        await new Promise(resolve => setTimeout(resolve, 150));
        item.classList.remove('pending');
        item.classList.add('starting');

        await new Promise(resolve => setTimeout(resolve, 300));
        item.classList.remove('starting');
        item.classList.add('completed');
      }

      // Show done button
      doneBtn.style.display = 'block';
      closeBtn.style.display = 'flex';

      // Notify other parts of app
      if (window.refreshWorktrees) {
        window.refreshWorktrees();
      }

    } else {
      // Error - show error state
      header.textContent = 'Failed to start services';
      header.style.color = 'var(--error)';

      // Mark all as error
      const items = list.querySelectorAll('.service-startup-item');
      items.forEach(item => {
        item.classList.remove('pending', 'starting');
        item.classList.add('error');
      });

      // Show error logs
      logs.style.display = 'block';
      logs.innerHTML = `<div class="progress-output-line" style="color: var(--error);">${result.error}</div>`;

      doneBtn.style.display = 'block';
      closeBtn.style.display = 'flex';
    }

  } catch (error) {
    header.textContent = 'Error starting services';
    header.style.color = 'var(--error)';

    // Mark all as error
    const items = list.querySelectorAll('.service-startup-item');
    items.forEach(item => {
      item.classList.remove('pending', 'starting');
      item.classList.add('error');
    });

    logs.style.display = 'block';
    logs.innerHTML = `<div class="progress-output-line" style="color: var(--error);">${error.message}</div>`;

    doneBtn.style.display = 'block';
    closeBtn.style.display = 'flex';
  }
}

/**
 * Hide the service startup modal
 */
window.hideServiceStartupModal = function() {
  const modal = document.getElementById('service-startup-modal');
  const header = document.getElementById('service-startup-header');
  modal.classList.remove('active');

  // Reset header color
  header.style.color = '';
};

// Export to global scope
window.showServiceStartupModal = showServiceStartupModal;
