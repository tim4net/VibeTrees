// Database operations UI
class DatabaseUI {
  constructor() {
    this.currentWorktree = null;
    this.init();
  }

  init() {
    // Initialize event listeners when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
    } else {
      this.setupEventListeners();
    }
  }

  setupEventListeners() {
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const viewSchemaBtn = document.getElementById('viewSchemaBtn');
    const backupBtn = document.getElementById('backupDatabase');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExport());
    }
    if (importBtn) {
      importBtn.addEventListener('click', () => this.handleImport());
    }
    if (viewSchemaBtn) {
      viewSchemaBtn.addEventListener('click', () => this.handleViewSchema());
    }
    if (backupBtn) {
      backupBtn.addEventListener('click', () => this.handleBackup());
    }
  }

  setWorktree(worktreeName) {
    this.currentWorktree = worktreeName;
  }

  async handleExport() {
    if (!this.currentWorktree) {
      alert('Please select a worktree first');
      return;
    }

    const type = document.getElementById('exportType').value;

    try {
      const response = await fetch(`/api/worktrees/${this.currentWorktree}/database/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
      }

      // Trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentWorktree}-${type}-${Date.now()}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      alert('Export complete!');
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error.message}`);
    }
  }

  async handleImport() {
    if (!this.currentWorktree) {
      alert('Please select a worktree first');
      return;
    }

    const fileInput = document.getElementById('importFile');
    const validate = document.getElementById('validateImport').checked;

    if (!fileInput.files.length) {
      alert('Please select a file to import');
      return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('validate', validate);

    try {
      const progressDiv = document.getElementById('importProgress');
      const progressBar = document.getElementById('progressBar');
      const progressText = document.getElementById('progressText');

      progressDiv.style.display = 'block';
      progressBar.value = 50;
      progressText.textContent = '50%';

      const response = await fetch(`/api/worktrees/${this.currentWorktree}/database/import`, {
        method: 'POST',
        body: formData
      });

      progressBar.value = 100;
      progressText.textContent = '100%';

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }

      alert('Import complete!');
      fileInput.value = '';
    } catch (error) {
      console.error('Import error:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setTimeout(() => {
        document.getElementById('importProgress').style.display = 'none';
        document.getElementById('progressBar').value = 0;
      }, 1000);
    }
  }

  async handleViewSchema() {
    if (!this.currentWorktree) {
      alert('Please select a worktree first');
      return;
    }

    try {
      const response = await fetch(`/api/worktrees/${this.currentWorktree}/database/schema`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch schema');
      }

      const data = await response.json();
      const display = document.getElementById('schemaDisplay');
      display.textContent = JSON.stringify(data.schema, null, 2);
      display.style.display = 'block';
    } catch (error) {
      console.error('Schema error:', error);
      alert(`Failed to load schema: ${error.message}`);
    }
  }

  async handleBackup() {
    if (!this.currentWorktree) {
      alert('Please select a worktree first');
      return;
    }

    const button = document.getElementById('backupDatabase');
    const originalText = button.querySelector('span').textContent;

    button.disabled = true;
    button.querySelector('span').textContent = 'Creating backup...';

    try {
      const response = await fetch(`/api/worktrees/${this.currentWorktree}/database/backup`, {
        method: 'POST'
      });

      const result = await response.json();

      if (result.success) {
        alert(`✓ Backup created successfully\n\nFile: ${result.backupPath.split('/').pop()}\nTime: ${new Date(result.timestamp).toLocaleString()}`);
      } else {
        alert(`✗ Backup failed\n\n${result.error}`);
      }
    } catch (error) {
      alert(`✗ Backup failed\n\n${error.message}`);
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = originalText;
    }
  }
}

// Initialize
const dbUI = new DatabaseUI();

// Expose for use in other scripts
window.dbUI = dbUI;

// Helper functions for modal management
function showDatabaseModal(worktreeName) {
  if (worktreeName) {
    dbUI.setWorktree(worktreeName);
  }
  document.getElementById('database-modal').classList.add('show');
}

function closeDatabaseModal() {
  document.getElementById('database-modal').classList.remove('show');
  // Reset form
  document.getElementById('importFile').value = '';
  document.getElementById('schemaDisplay').style.display = 'none';
}
