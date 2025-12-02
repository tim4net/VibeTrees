# Database Import/Export

Export and import PostgreSQL databases between worktrees.

## Export

```bash
POST /api/worktrees/:name/database/export
Body: { "type": "full" }  # or "schema" or "data"
```

Returns a SQL file download.

## Import

```bash
POST /api/worktrees/:name/database/import
Body: FormData with SQL file
```

Imports are wrapped in a transaction - if anything fails, it rolls back.

## Schema

```bash
GET /api/worktrees/:name/database/schema
```

Returns table definitions for the worktree's database.

## Notes

- PostgreSQL only for now
- Large imports (>1GB) may timeout
- Schema validation can be overly conservative
