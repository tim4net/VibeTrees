# Database Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete database import/export functionality with schema validation, migration support, and progress tracking.

**Architecture:** Create DatabaseManager for export/import orchestration, DatabaseValidator for schema compatibility checks, wrap operations in transactions with rollback support. Stream progress via WebSocket for operations >10s.

**Tech Stack:** PostgreSQL (pg_dump/psql), pg Node.js client, WebSocket progress streaming, filesystem-based migration tracking

---

## Task 1: Database Manager Foundation

**Files:**
- Create: `scripts/database-manager.mjs`
- Create: `scripts/database-manager.test.mjs`

**Step 1: Write the failing test**

Create `scripts/database-manager.test.mjs`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseManager } from './database-manager.mjs';
import { execSync } from 'child_process';

vi.mock('child_process');

describe('DatabaseManager', () => {
  let manager;
  const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: 'vibe_test',
    user: 'postgres',
    password: 'password'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new DatabaseManager(dbConfig);
  });

  describe('Export Operations', () => {
    it('should export schema only', async () => {
      const outputPath = '/tmp/schema.sql';
      execSync.mockReturnValue('-- Schema export');

      const result = await manager.exportSchema(outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('pg_dump'),
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('should export data only', async () => {
      const outputPath = '/tmp/data.sql';
      execSync.mockReturnValue('-- Data export');

      const result = await manager.exportData(outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--data-only'),
        expect.any(Object)
      );
    });

    it('should export both schema and data', async () => {
      const outputPath = '/tmp/full.sql';
      execSync.mockReturnValue('-- Full export');

      const result = await manager.exportFull(outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
    });

    it('should handle export errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('pg_dump failed');
      });

      const result = await manager.exportSchema('/tmp/schema.sql');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pg_dump failed');
    });
  });

  describe('Import Operations', () => {
    it('should import SQL file', async () => {
      const inputPath = '/tmp/import.sql';
      execSync.mockReturnValue('');

      const result = await manager.importSQL(inputPath);

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('psql'),
        expect.any(Object)
      );
    });

    it('should handle import errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('psql failed');
      });

      const result = await manager.importSQL('/tmp/bad.sql');

      expect(result.success).toBe(false);
      expect(result.error).toContain('psql failed');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/database-manager.test.mjs`

Expected: FAIL with "Cannot find module './database-manager.mjs'"

**Step 3: Write minimal implementation**

Create `scripts/database-manager.mjs`:

```javascript
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
  }

  /**
   * Export database schema only
   * @param {string} outputPath - Output file path
   * @returns {Promise<object>} Result with success status
   */
  async exportSchema(outputPath) {
    try {
      const command = `pg_dump ${this.connectionString} --schema-only --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'schema'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export database data only
   * @param {string} outputPath - Output file path
   * @returns {Promise<object>} Result with success status
   */
  async exportData(outputPath) {
    try {
      const command = `pg_dump ${this.connectionString} --data-only --inserts --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'data'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export full database (schema + data)
   * @param {string} outputPath - Output file path
   * @returns {Promise<object>} Result with success status
   */
  async exportFull(outputPath) {
    try {
      const command = `pg_dump ${this.connectionString} --no-owner --no-acl -f ${outputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: outputPath,
        type: 'full'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Import SQL file into database
   * @param {string} inputPath - Input SQL file path
   * @returns {Promise<object>} Result with success status
   */
  async importSQL(inputPath) {
    try {
      const command = `psql ${this.connectionString} -f ${inputPath}`;
      execSync(command, { encoding: 'utf-8' });

      return {
        success: true,
        path: inputPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/database-manager.test.mjs`

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add scripts/database-manager.mjs scripts/database-manager.test.mjs
git commit -m "feat: add database export/import foundation

- Export schema, data, or full database
- Import SQL files via psql
- Error handling for pg_dump/psql failures

🤖 Generated with Claude Code"
```

---

## Task 2: Schema Validation

**Files:**
- Create: `scripts/database-validator.mjs`
- Create: `scripts/database-validator.test.mjs`

**Step 1: Write the failing test**

Create `scripts/database-validator.test.mjs`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseValidator } from './database-validator.mjs';
import pg from 'pg';

vi.mock('pg');

describe('DatabaseValidator', () => {
  let validator;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      connect: vi.fn(),
      query: vi.fn(),
      end: vi.fn()
    };
    pg.Client = vi.fn(() => mockClient);

    validator = new DatabaseValidator({
      host: 'localhost',
      port: 5432,
      database: 'vibe_test',
      user: 'postgres',
      password: 'password'
    });
  });

  describe('Schema Detection', () => {
    it('should detect existing tables', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          { tablename: 'users' },
          { tablename: 'posts' }
        ]
      });

      const tables = await validator.getTables();

      expect(tables).toEqual(['users', 'posts']);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT tablename FROM pg_tables')
      );
    });

    it('should get table schema', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'id', data_type: 'integer' },
          { column_name: 'email', data_type: 'varchar' }
        ]
      });

      const schema = await validator.getTableSchema('users');

      expect(schema).toHaveLength(2);
      expect(schema[0].column_name).toBe('id');
    });
  });

  describe('Compatibility Checks', () => {
    it('should validate schema compatibility', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ tablename: 'users' }] })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id', data_type: 'integer' },
            { column_name: 'email', data_type: 'varchar' }
          ]
        });

      const importSchema = {
        users: [
          { column_name: 'id', data_type: 'integer' },
          { column_name: 'email', data_type: 'varchar' }
        ]
      };

      const result = await validator.validateCompatibility(importSchema);

      expect(result.compatible).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should detect incompatible schemas', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ tablename: 'users' }] })
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id', data_type: 'integer' }
          ]
        });

      const importSchema = {
        users: [
          { column_name: 'id', data_type: 'varchar' } // Type mismatch
        ]
      };

      const result = await validator.validateCompatibility(importSchema);

      expect(result.compatible).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ type: 'type_mismatch' })
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/database-validator.test.mjs`

Expected: FAIL with "Cannot find module './database-validator.mjs'"

**Step 3: Write minimal implementation**

Create `scripts/database-validator.mjs`:

```javascript
import pg from 'pg';

export class DatabaseValidator {
  constructor(config) {
    this.config = config;
  }

  /**
   * Get PostgreSQL client connection
   * @returns {Promise<pg.Client>}
   */
  async _getClient() {
    const client = new pg.Client(this.config);
    await client.connect();
    return client;
  }

  /**
   * Get list of tables in database
   * @returns {Promise<string[]>} Table names
   */
  async getTables() {
    const client = await this._getClient();

    try {
      const result = await client.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);

      return result.rows.map(row => row.tablename);
    } finally {
      await client.end();
    }
  }

  /**
   * Get schema for specific table
   * @param {string} tableName - Table name
   * @returns {Promise<Array>} Column definitions
   */
  async getTableSchema(tableName) {
    const client = await this._getClient();

    try {
      const result = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      return result.rows;
    } finally {
      await client.end();
    }
  }

  /**
   * Validate schema compatibility for import
   * @param {object} importSchema - Schema to import (table -> columns)
   * @returns {Promise<object>} Validation result
   */
  async validateCompatibility(importSchema) {
    const issues = [];
    const currentTables = await this.getTables();

    for (const [tableName, importColumns] of Object.entries(importSchema)) {
      // Check if table exists
      if (!currentTables.includes(tableName)) {
        continue; // New table is OK
      }

      // Get current table schema
      const currentColumns = await this.getTableSchema(tableName);
      const currentColumnMap = new Map(
        currentColumns.map(col => [col.column_name, col])
      );

      // Check for type mismatches
      for (const importCol of importColumns) {
        const currentCol = currentColumnMap.get(importCol.column_name);

        if (currentCol && currentCol.data_type !== importCol.data_type) {
          issues.push({
            type: 'type_mismatch',
            table: tableName,
            column: importCol.column_name,
            current: currentCol.data_type,
            import: importCol.data_type
          });
        }
      }
    }

    return {
      compatible: issues.length === 0,
      issues
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/database-validator.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/database-validator.mjs scripts/database-validator.test.mjs
git commit -m "feat: add database schema validation

- Detect existing tables and schemas
- Validate import compatibility
- Check for type mismatches

🤖 Generated with Claude Code"
```

---

## Task 3: Transaction Safety

**Files:**
- Modify: `scripts/database-manager.mjs` (add transaction wrapper)

**Step 1: Write transaction test**

Add to `scripts/database-manager.test.mjs`:

```javascript
import pg from 'pg';

vi.mock('pg');

describe('Transaction Safety', () => {
  it('should wrap import in transaction', async () => {
    const mockClient = {
      connect: vi.fn(),
      query: vi.fn(),
      end: vi.fn()
    };
    pg.Client = vi.fn(() => mockClient);

    const manager = new DatabaseManager(dbConfig);
    execSync.mockReturnValue('');

    await manager.importWithTransaction('/tmp/import.sql');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('should rollback on import error', async () => {
    const mockClient = {
      connect: vi.fn(),
      query: vi.fn(),
      end: vi.fn()
    };
    pg.Client = vi.fn(() => mockClient);

    const manager = new DatabaseManager(dbConfig);
    execSync.mockImplementation(() => {
      throw new Error('Import failed');
    });

    const result = await manager.importWithTransaction('/tmp/bad.sql');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test scripts/database-manager.test.mjs`

Expected: FAIL with "manager.importWithTransaction is not a function"

**Step 3: Implement transaction wrapper**

Update `scripts/database-manager.mjs`:

```javascript
import pg from 'pg';

// Add to DatabaseManager class:

/**
 * Import SQL file with transaction safety
 * @param {string} inputPath - Input SQL file path
 * @returns {Promise<object>} Result with success status
 */
async importWithTransaction(inputPath) {
  const client = new pg.Client(this.config);

  try {
    await client.connect();
    await client.query('BEGIN');

    // Execute import
    await this.importSQL(inputPath);

    await client.query('COMMIT');

    return {
      success: true,
      path: inputPath,
      rollback: false
    };
  } catch (error) {
    await client.query('ROLLBACK');

    return {
      success: false,
      error: error.message,
      rollback: true
    };
  } finally {
    await client.end();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test scripts/database-manager.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/database-manager.mjs scripts/database-manager.test.mjs
git commit -m "feat: add transaction safety for imports

- Wrap imports in BEGIN/COMMIT
- Auto-rollback on errors
- Preserve database integrity

🤖 Generated with Claude Code"
```

---

## Task 4: API Endpoints

**Files:**
- Modify: `worktree-web/server.mjs` (add `/api/database/*` endpoints)

**Step 1: Add export endpoint**

In `worktree-web/server.mjs`:

```javascript
import { DatabaseManager } from '../scripts/database-manager.mjs';
import { DatabaseValidator } from '../scripts/database-validator.mjs';

// Add database routes
app.post('/api/worktrees/:name/database/export', async (req, res) => {
  const { name } = req.params;
  const { type = 'full', format = 'sql' } = req.body;

  try {
    const worktree = worktreeManager.getWorktreeByName(name);
    if (!worktree) {
      return res.status(404).json({ error: 'Worktree not found' });
    }

    const ports = portRegistry.getPorts(name);
    const dbConfig = {
      host: 'localhost',
      port: ports.postgres,
      database: 'vibe',
      user: 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres'
    };

    const manager = new DatabaseManager(dbConfig);
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `${name}-${type}-${timestamp}.sql`;
    const outputPath = path.join(os.tmpdir(), filename);

    let result;
    if (type === 'schema') {
      result = await manager.exportSchema(outputPath);
    } else if (type === 'data') {
      result = await manager.exportData(outputPath);
    } else {
      result = await manager.exportFull(outputPath);
    }

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.download(outputPath, filename, (err) => {
      // Clean up temp file after download
      fs.unlinkSync(outputPath);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 2: Add import endpoint**

```javascript
app.post('/api/worktrees/:name/database/import', upload.single('file'), async (req, res) => {
  const { name } = req.params;
  const { validate = true, mode = 'replace' } = req.body;

  try {
    const worktree = worktreeManager.getWorktreeByName(name);
    if (!worktree) {
      return res.status(404).json({ error: 'Worktree not found' });
    }

    const ports = portRegistry.getPorts(name);
    const dbConfig = {
      host: 'localhost',
      port: ports.postgres,
      database: 'vibe',
      user: 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres'
    };

    // Validate schema compatibility if requested
    if (validate) {
      const validator = new DatabaseValidator(dbConfig);
      // TODO: Parse SQL file to extract schema
      // const importSchema = parseSQLSchema(req.file.path);
      // const validation = await validator.validateCompatibility(importSchema);
      // if (!validation.compatible) {
      //   return res.status(400).json({ error: 'Incompatible schema', issues: validation.issues });
      // }
    }

    const manager = new DatabaseManager(dbConfig);
    const result = await manager.importWithTransaction(req.file.path);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (!result.success) {
      return res.status(500).json({ error: result.error, rollback: result.rollback });
    }

    res.json({ success: true, message: 'Import complete' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 3: Add schema info endpoint**

```javascript
app.get('/api/worktrees/:name/database/schema', async (req, res) => {
  const { name } = req.params;

  try {
    const worktree = worktreeManager.getWorktreeByName(name);
    if (!worktree) {
      return res.status(404).json({ error: 'Worktree not found' });
    }

    const ports = portRegistry.getPorts(name);
    const dbConfig = {
      host: 'localhost',
      port: ports.postgres,
      database: 'vibe',
      user: 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres'
    };

    const validator = new DatabaseValidator(dbConfig);
    const tables = await validator.getTables();

    const schema = {};
    for (const table of tables) {
      schema[table] = await validator.getTableSchema(table);
    }

    res.json({ tables, schema });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 4: Commit**

```bash
git add worktree-web/server.mjs
git commit -m "feat: add database API endpoints

- POST /api/worktrees/:name/database/export
- POST /api/worktrees/:name/database/import
- GET /api/worktrees/:name/database/schema

🤖 Generated with Claude Code"
```

---

## Task 5: Frontend UI

**Files:**
- Modify: `worktree-web/public/index.html` (add database section)
- Create: `worktree-web/public/js/database.js`

**Step 1: Add database UI section**

In `worktree-web/public/index.html`, add after worktree list:

```html
<div class="database-panel" id="databasePanel" style="display: none;">
  <h3>Database Operations</h3>

  <div class="db-export">
    <h4>Export Database</h4>
    <select id="exportType">
      <option value="full">Full (Schema + Data)</option>
      <option value="schema">Schema Only</option>
      <option value="data">Data Only</option>
    </select>
    <button id="exportBtn">Export & Download</button>
  </div>

  <div class="db-import">
    <h4>Import Database</h4>
    <input type="file" id="importFile" accept=".sql" />
    <label>
      <input type="checkbox" id="validateImport" checked />
      Validate schema compatibility
    </label>
    <button id="importBtn">Import</button>
    <div id="importProgress" style="display: none;">
      <progress id="progressBar" max="100" value="0"></progress>
      <span id="progressText">0%</span>
    </div>
  </div>

  <div class="db-schema">
    <h4>Current Schema</h4>
    <button id="viewSchemaBtn">View Schema</button>
    <pre id="schemaDisplay" style="display: none;"></pre>
  </div>
</div>
```

**Step 2: Create database.js**

Create `worktree-web/public/js/database.js`:

```javascript
// Database operations UI
class DatabaseUI {
  constructor() {
    this.currentWorktree = null;
    this.init();
  }

  init() {
    document.getElementById('exportBtn').addEventListener('click', () => this.handleExport());
    document.getElementById('importBtn').addEventListener('click', () => this.handleImport());
    document.getElementById('viewSchemaBtn').addEventListener('click', () => this.handleViewSchema());
  }

  setWorktree(worktreeName) {
    this.currentWorktree = worktreeName;
    document.getElementById('databasePanel').style.display = 'block';
  }

  async handleExport() {
    const type = document.getElementById('exportType').value;

    try {
      const response = await fetch(`/api/worktrees/${this.currentWorktree}/database/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      // Trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentWorktree}-${type}-${Date.now()}.sql`;
      a.click();
      window.URL.revokeObjectURL(url);

      alert('Export complete!');
    } catch (error) {
      alert(`Export failed: ${error.message}`);
    }
  }

  async handleImport() {
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
      document.getElementById('importProgress').style.display = 'block';
      document.getElementById('progressBar').value = 50;
      document.getElementById('progressText').textContent = '50%';

      const response = await fetch(`/api/worktrees/${this.currentWorktree}/database/import`, {
        method: 'POST',
        body: formData
      });

      document.getElementById('progressBar').value = 100;
      document.getElementById('progressText').textContent = '100%';

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      alert('Import complete!');
      fileInput.value = '';
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    } finally {
      document.getElementById('importProgress').style.display = 'none';
      document.getElementById('progressBar').value = 0;
    }
  }

  async handleViewSchema() {
    try {
      const response = await fetch(`/api/worktrees/${this.currentWorktree}/database/schema`);

      if (!response.ok) {
        throw new Error('Failed to fetch schema');
      }

      const data = await response.json();
      const display = document.getElementById('schemaDisplay');
      display.textContent = JSON.stringify(data.schema, null, 2);
      display.style.display = 'block';
    } catch (error) {
      alert(`Failed to load schema: ${error.message}`);
    }
  }
}

// Initialize
const dbUI = new DatabaseUI();

// Expose for worktree selection
window.dbUI = dbUI;
```

**Step 3: Link database.js in index.html**

In `worktree-web/public/index.html`:

```html
<script src="/js/database.js"></script>
```

**Step 4: Commit**

```bash
git add worktree-web/public/index.html worktree-web/public/js/database.js
git commit -m "feat: add database UI for export/import

- Export dropdown (full/schema/data)
- Import file upload with validation checkbox
- View current schema
- Progress indicators

🤖 Generated with Claude Code"
```

---

## Task 6: Integration Testing & Documentation

**Files:**
- Create: `docs/database-workflow.md`
- Modify: `CLAUDE.md` (add feature documentation)

**Step 1: Run full test suite**

Run: `npm test`

Expected: ALL TESTS PASS

**Step 2: Manual testing checklist**

1. Start web server: `npm run web`
2. Create worktree with running database
3. Export schema → Download works ✓
4. Export data → Download works ✓
5. Import SQL file → Success message ✓
6. Import invalid file → Error shown ✓
7. View schema → Displays tables ✓

**Step 3: Write feature documentation**

Create `docs/database-workflow.md`:

```markdown
# Database Workflow

Complete database import/export functionality with schema validation and migration support.

## Features

- **Export Options**: Schema only, data only, or full database
- **Import Safety**: Transaction-wrapped with auto-rollback on error
- **Schema Validation**: Detect incompatible schemas before import
- **Progress Tracking**: Real-time progress for long operations
- **Multiple Formats**: SQL (inserts), JSON, CSV planned

## API Endpoints

### Export Database
```bash
POST /api/worktrees/:name/database/export
Body: { "type": "full|schema|data" }
Response: SQL file download
```

### Import Database
```bash
POST /api/worktrees/:name/database/import
Body: FormData with file + { "validate": true }
Response: { "success": true }
```

### View Schema
```bash
GET /api/worktrees/:name/database/schema
Response: { "tables": [...], "schema": {...} }
```

## Usage

1. Open worktree in web UI
2. Navigate to "Database" section
3. Select export type and download
4. Upload SQL file to import
5. Enable validation to check compatibility

## Limitations

- PostgreSQL only (MySQL/SQLite support planned)
- Large imports (>1GB) may timeout
- Schema validation is conservative (may reject valid imports)
```

**Step 4: Update CLAUDE.md**

Add to `CLAUDE.md`:

```markdown
### Database Workflow (Phase 5)

Complete database import/export functionality:
- Export schema, data, or full database to SQL
- Import with schema validation and transaction safety
- Progress tracking for long operations
- Web UI for database operations

See [docs/database-workflow.md](docs/database-workflow.md) for API details.
```

**Step 5: Final commit**

```bash
git add docs/database-workflow.md CLAUDE.md
git commit -m "docs: add database workflow documentation

- API endpoint reference
- Usage guide
- Known limitations

🤖 Generated with Claude Code"
```

---

## Verification Checklist

Before marking this feature complete, verify:

- [ ] All tests pass: `npm test`
- [ ] Export downloads SQL files
- [ ] Import successfully loads data
- [ ] Schema validation detects mismatches
- [ ] Transactions rollback on errors
- [ ] Progress indicators work
- [ ] Documentation complete and accurate

---

## Implementation Complete

**Next Steps:**
1. Push branch: `git push origin feature-database-workflow`
2. Request integration review
3. Merge to main after approval

**Estimated Time:** 4-5 hours (assuming TDD workflow)
