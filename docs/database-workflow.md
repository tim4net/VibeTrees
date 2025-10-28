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
