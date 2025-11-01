import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';

// Mock fs and os before importing ProjectManager
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({ projects: [], currentProject: null })),
    writeFileSync: vi.fn()
  }
}));

vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/Users/testuser')
  }
}));

// Import after mocking
const { ProjectManager } = await import('./project-manager.mjs');
const fs = (await import('fs')).default;
const os = (await import('os')).default;

describe('ProjectManager', () => {
  let projectManager;
  let mockProjectsFile;
  let mockProjects;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Setup default mock behaviors
    vi.mocked(os.homedir).mockReturnValue('/Users/testuser');

    // Setup mocks
    mockProjectsFile = path.join('/Users/testuser', '.vibetrees', 'projects.json');
    mockProjects = {
      projects: [],
      currentProject: null
    };

    // Mock fs operations - default to paths existing (tests override as needed)
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockProjects));
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    projectManager = new ProjectManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create projects directory if it does not exist', () => {
      // Clear mocks from beforeEach
      vi.clearAllMocks();

      // Set up mock so .vibetrees directory doesn't exist, but projects file read works
      vi.mocked(os.homedir).mockReturnValue('/Users/testuser');
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        // Directory doesn't exist, but we'll return true for other paths
        return path !== '/Users/testuser/.vibetrees';
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ projects: [], currentProject: null }));

      // Create a new instance to trigger initialization
      new ProjectManager();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join('/Users/testuser', '.vibetrees'),
        { recursive: true }
      );
    });

    it('should load existing projects from file', () => {
      const existingProjects = {
        projects: [
          { id: 'proj1', name: 'Project 1', path: '/path/to/proj1' }
        ],
        currentProject: 'proj1'
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingProjects));

      const pm = new ProjectManager();
      expect(pm.listProjects()).toHaveLength(1);
      expect(pm.getCurrentProject()).toEqual(existingProjects.projects[0]);
    });

    it('should initialize with empty projects if file does not exist', () => {
      expect(projectManager.listProjects()).toHaveLength(0);
      expect(projectManager.getCurrentProject()).toBeNull();
    });
  });

  describe('addProject', () => {
    it('should add a new project', () => {
      const project = projectManager.addProject({
        name: 'Test Project',
        path: '/path/to/test-project'
      });

      expect(project).toMatchObject({
        id: expect.any(String),
        name: 'Test Project',
        path: '/path/to/test-project',
        lastAccessed: expect.any(Number)
      });
    });

    it('should generate unique ID for each project', () => {
      const proj1 = projectManager.addProject({
        name: 'Project 1',
        path: '/path/1'
      });
      const proj2 = projectManager.addProject({
        name: 'Project 2',
        path: '/path/2'
      });

      expect(proj1.id).not.toBe(proj2.id);
    });

    it('should persist projects to file', () => {
      projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockProjectsFile,
        expect.stringContaining('"name": "Test"'),  // JSON.stringify adds space after colon
        'utf8'
      );
    });

    it('should normalize project path', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/path/to/project/'  // trailing slash
      });

      expect(project.path).toBe('/path/to/project');
    });

    it('should reject duplicate project paths', () => {
      projectManager.addProject({
        name: 'Project 1',
        path: '/same/path'
      });

      expect(() => {
        projectManager.addProject({
          name: 'Project 2',
          path: '/same/path'
        });
      }).toThrow('Project with path /same/path already exists');
    });

    it('should validate project path exists', () => {
      // Override mock for this specific test to return false for nonexistent path
      vi.mocked(fs.existsSync).mockImplementation((path) => path !== '/nonexistent/path');

      expect(() => {
        projectManager.addProject({
          name: 'Test',
          path: '/nonexistent/path'
        });
      }).toThrow('Path /nonexistent/path does not exist');
    });

    it('should set as current project if it is the first project', () => {
      const project = projectManager.addProject({
        name: 'First',
        path: '/first'
      });

      expect(projectManager.getCurrentProject()).toEqual(project);
    });
  });

  describe('listProjects', () => {
    it('should return all projects', async () => {
      projectManager.addProject({ name: 'P1', path: '/p1' });
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      projectManager.addProject({ name: 'P2', path: '/p2' });

      const projects = projectManager.listProjects();
      expect(projects).toHaveLength(2);
      // Projects are sorted by lastAccessed descending, so P2 (most recent) comes first
      expect(projects[0].name).toBe('P2');
      expect(projects[1].name).toBe('P1');
    });

    it('should return projects sorted by lastAccessed descending', () => {
      const p1 = projectManager.addProject({ name: 'P1', path: '/p1' });
      const p2 = projectManager.addProject({ name: 'P2', path: '/p2' });

      // Simulate accessing p1 after p2
      projectManager.setCurrentProject(p2.id);
      projectManager.setCurrentProject(p1.id);

      const projects = projectManager.listProjects();
      expect(projects[0].id).toBe(p1.id);  // most recently accessed
    });
  });

  describe('getProject', () => {
    it('should return project by ID', () => {
      const added = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      const found = projectManager.getProject(added.id);
      expect(found).toEqual(added);
    });

    it('should return null for non-existent ID', () => {
      expect(projectManager.getProject('nonexistent')).toBeNull();
    });
  });

  describe('updateProject', () => {
    it('should update project properties', () => {
      const project = projectManager.addProject({
        name: 'Original',
        path: '/original'
      });

      const updated = projectManager.updateProject(project.id, {
        name: 'Updated'
      });

      expect(updated.name).toBe('Updated');
      expect(updated.path).toBe('/original');  // unchanged
    });

    it('should persist changes', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      vi.clearAllMocks();

      projectManager.updateProject(project.id, { name: 'Updated' });

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error for non-existent project', () => {
      expect(() => {
        projectManager.updateProject('nonexistent', { name: 'Test' });
      }).toThrow('Project not found: nonexistent');
    });
  });

  describe('deleteProject', () => {
    it('should remove project', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      projectManager.deleteProject(project.id);

      expect(projectManager.getProject(project.id)).toBeNull();
      expect(projectManager.listProjects()).toHaveLength(0);
    });

    it('should clear current project if it is being deleted', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      projectManager.setCurrentProject(project.id);
      projectManager.deleteProject(project.id);

      expect(projectManager.getCurrentProject()).toBeNull();
    });

    it('should persist changes', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      vi.clearAllMocks();

      projectManager.deleteProject(project.id);

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error for non-existent project', () => {
      expect(() => {
        projectManager.deleteProject('nonexistent');
      }).toThrow('Project not found: nonexistent');
    });
  });

  describe('getCurrentProject', () => {
    it('should return current project', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      projectManager.setCurrentProject(project.id);

      expect(projectManager.getCurrentProject()).toEqual(project);
    });

    it('should return null if no project is set', () => {
      expect(projectManager.getCurrentProject()).toBeNull();
    });
  });

  describe('setCurrentProject', () => {
    it('should set current project by ID', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      projectManager.setCurrentProject(project.id);

      expect(projectManager.getCurrentProject()).toEqual(project);
    });

    it('should update lastAccessed timestamp', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      const originalTimestamp = project.lastAccessed;

      // Wait a bit
      vi.useFakeTimers();
      vi.advanceTimersByTime(1000);

      projectManager.setCurrentProject(project.id);

      vi.useRealTimers();

      const updated = projectManager.getProject(project.id);
      expect(updated.lastAccessed).toBeGreaterThan(originalTimestamp);
    });

    it('should persist changes', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/test'
      });

      vi.clearAllMocks();

      projectManager.setCurrentProject(project.id);

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should throw error for non-existent project', () => {
      expect(() => {
        projectManager.setCurrentProject('nonexistent');
      }).toThrow('Project not found: nonexistent');
    });
  });

  describe('detectProjectFromPath', () => {
    it('should find project by exact path match', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/path/to/project'
      });

      const found = projectManager.detectProjectFromPath('/path/to/project');
      expect(found).toEqual(project);
    });

    it('should find project by child path', () => {
      const project = projectManager.addProject({
        name: 'Test',
        path: '/path/to/project'
      });

      const found = projectManager.detectProjectFromPath('/path/to/project/subdir/file.js');
      expect(found).toEqual(project);
    });

    it('should return null if no matching project', () => {
      projectManager.addProject({
        name: 'Test',
        path: '/path/to/project'
      });

      expect(projectManager.detectProjectFromPath('/other/path')).toBeNull();
    });

    it('should prefer more specific path match', () => {
      const parent = projectManager.addProject({
        name: 'Parent',
        path: '/projects'
      });
      const child = projectManager.addProject({
        name: 'Child',
        path: '/projects/child'
      });

      const found = projectManager.detectProjectFromPath('/projects/child/file.js');
      expect(found.id).toBe(child.id);
    });
  });
});
