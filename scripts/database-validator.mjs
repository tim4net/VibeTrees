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
