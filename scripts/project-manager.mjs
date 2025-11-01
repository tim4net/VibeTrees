/**
 * Project Manager
 * Manages multiple git projects for VibeTrees
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

export class ProjectManager {
  constructor() {
    this.projectsFile = path.join(os.homedir(), '.vibetrees', 'projects.json');
    this.projects = [];
    this.currentProjectId = null;

    this._ensureProjectsDirectory();
    this._loadProjects();
  }

  /**
   * Ensure the .vibetrees directory exists
   * @private
   */
  _ensureProjectsDirectory() {
    const dir = path.dirname(this.projectsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load projects from disk
   * @private
   */
  _loadProjects() {
    if (fs.existsSync(this.projectsFile)) {
      try {
        const data = fs.readFileSync(this.projectsFile, 'utf8');
        const parsed = JSON.parse(data);
        this.projects = parsed.projects || [];
        this.currentProjectId = parsed.currentProject || null;
      } catch (err) {
        console.error('[ProjectManager] Failed to load projects:', err.message);
        this.projects = [];
        this.currentProjectId = null;
      }
    }
  }

  /**
   * Save projects to disk
   * @private
   */
  _saveProjects() {
    const data = {
      projects: this.projects,
      currentProject: this.currentProjectId
    };

    try {
      fs.writeFileSync(this.projectsFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[ProjectManager] Failed to save projects:', err.message);
      throw err;
    }
  }

  /**
   * Normalize path (remove trailing slash, resolve)
   * @param {string} projectPath
   * @returns {string}
   * @private
   */
  _normalizePath(projectPath) {
    return path.resolve(projectPath).replace(/\/$/, '');
  }

  /**
   * Add a new project
   * @param {Object} options
   * @param {string} options.name - Project name
   * @param {string} options.path - Project path
   * @returns {Object} Created project
   */
  addProject({ name, path: projectPath }) {
    const normalizedPath = this._normalizePath(projectPath);

    // Validate path exists
    if (!fs.existsSync(normalizedPath)) {
      throw new Error(`Path ${normalizedPath} does not exist`);
    }

    // Check for duplicate path
    const existingProject = this.projects.find(p => p.path === normalizedPath);
    if (existingProject) {
      throw new Error(`Project with path ${normalizedPath} already exists`);
    }

    const project = {
      id: randomUUID(),
      name,
      path: normalizedPath,
      lastAccessed: Date.now()
    };

    this.projects.push(project);

    // Set as current if it's the first project
    if (this.projects.length === 1) {
      this.currentProjectId = project.id;
    }

    this._saveProjects();

    return project;
  }

  /**
   * List all projects
   * @returns {Array} Projects sorted by lastAccessed descending
   */
  listProjects() {
    return [...this.projects].sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  /**
   * Get project by ID
   * @param {string} id - Project ID
   * @returns {Object|null} Project or null
   */
  getProject(id) {
    return this.projects.find(p => p.id === id) || null;
  }

  /**
   * Update project
   * @param {string} id - Project ID
   * @param {Object} updates - Properties to update
   * @returns {Object} Updated project
   */
  updateProject(id, updates) {
    const project = this.getProject(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    Object.assign(project, updates);
    this._saveProjects();

    return project;
  }

  /**
   * Delete project
   * @param {string} id - Project ID
   */
  deleteProject(id) {
    const projectIndex = this.projects.findIndex(p => p.id === id);
    if (projectIndex === -1) {
      throw new Error(`Project not found: ${id}`);
    }

    this.projects.splice(projectIndex, 1);

    // Clear current project if it was deleted
    if (this.currentProjectId === id) {
      this.currentProjectId = null;
    }

    this._saveProjects();
  }

  /**
   * Get current project
   * @returns {Object|null} Current project or null
   */
  getCurrentProject() {
    if (!this.currentProjectId) {
      return null;
    }
    return this.getProject(this.currentProjectId);
  }

  /**
   * Set current project
   * @param {string} id - Project ID
   */
  setCurrentProject(id) {
    const project = this.getProject(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    this.currentProjectId = id;
    project.lastAccessed = Date.now();

    this._saveProjects();
  }

  /**
   * Detect project from a file/directory path
   * Finds the project whose path is an ancestor of the given path
   * @param {string} targetPath - Path to check
   * @returns {Object|null} Matching project or null
   */
  detectProjectFromPath(targetPath) {
    const normalized = this._normalizePath(targetPath);

    // Find all projects that match (path is ancestor)
    const matches = this.projects.filter(project => {
      return normalized === project.path || normalized.startsWith(project.path + path.sep);
    });

    if (matches.length === 0) {
      return null;
    }

    // Return the most specific match (longest path)
    return matches.reduce((best, current) => {
      return current.path.length > best.path.length ? current : best;
    });
  }
}
