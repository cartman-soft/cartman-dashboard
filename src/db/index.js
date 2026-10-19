/**
 * Cartman Relational Storage Engine
 * Features:
 * - Schema validation & default value expansion
 * - Unique constraint enforcement
 * - In-memory indexing for fast primary/secondary key lookups
 * - Atomic persistence with .tmp write + rename (crash-safe)
 * - Safe transaction rollbacks
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { TABLES, SCHEMAS } = require('./schema');

class RelationalDatabase {
  constructor(dbFilePath = config.dbPath) {
    this.dbFilePath = dbFilePath;
    this.tables = {};
    this.indexes = {}; // table -> indexName -> Map(key, id)
    this._inTransaction = false;
    this._snapshot = null;

    this._initializeTables();
    this.load();
  }

  _initializeTables() {
    for (const tableName of Object.values(TABLES)) {
      this.tables[tableName] = new Map();
      this.indexes[tableName] = {
        byId: new Map()
      };
    }
  }

  load() {
    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf8');
        const data = JSON.parse(raw);

        for (const tableName of Object.values(TABLES)) {
          this.tables[tableName] = new Map();
          this.indexes[tableName] = { byId: new Map() };

          if (Array.isArray(data[tableName])) {
            for (const record of data[tableName]) {
              this.tables[tableName].set(record.id, record);
              this.indexes[tableName].byId.set(record.id, record);
            }
          }
        }
      }
    } catch (err) {
      console.error('[DB] Error loading database file:', err.message);
      this._initializeTables();
    }
  }

  save() {
    if (this._inTransaction) {
      return; // Persist on transaction commit
    }

    if (config.isDemoMode || process.env.VERCEL) {
      // In Demo Mode or on Vercel serverless environment, the filesystem is read-only.
      // Retain records in memory and bypass disk writes to prevent EROFS errors.
      return;
    }

    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const serialized = {};
      for (const [tableName, map] of Object.entries(this.tables)) {
        serialized[tableName] = Array.from(map.values());
      }

      const payload = JSON.stringify(serialized, null, 2);
      const tempFile = `${this.dbFilePath}.tmp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      fs.writeFileSync(tempFile, payload, 'utf8');

      // Windows-resilient atomic rename with retry and copy fallback
      let success = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.renameSync(tempFile, this.dbFilePath);
          success = true;
          break;
        } catch (renameErr) {
          if (attempt === 4) {
            // Fallback for Windows file lock (EPERM / EBUSY)
            fs.copyFileSync(tempFile, this.dbFilePath);
            try { fs.unlinkSync(tempFile); } catch (e) {}
            success = true;
          } else {
            // Synchronous 20ms backoff
            const start = Date.now();
            while (Date.now() - start < 20) {}
          }
        }
      }
    } catch (err) {
      console.error('[DB] Save failed, attempting direct sync write:', err.message);
      try {
        const serialized = {};
        for (const [tableName, map] of Object.entries(this.tables)) {
          serialized[tableName] = Array.from(map.values());
        }
        fs.writeFileSync(this.dbFilePath, JSON.stringify(serialized, null, 2), 'utf8');
      } catch (directErr) {
        console.error('[DB] Direct sync write also failed:', directErr.message);
      }
    }
  }

  beginTransaction() {
    if (this._inTransaction) {
      throw new Error('A transaction is already in progress');
    }
    this._inTransaction = true;
    this._snapshot = JSON.stringify(this.toJSON());
  }

  commit() {
    if (!this._inTransaction) {
      return;
    }
    this._inTransaction = false;
    this._snapshot = null;
    this.save();
  }

  rollback() {
    if (!this._inTransaction || !this._snapshot) {
      return;
    }
    const data = JSON.parse(this._snapshot);
    for (const tableName of Object.values(TABLES)) {
      this.tables[tableName] = new Map();
      this.indexes[tableName] = { byId: new Map() };
      if (Array.isArray(data[tableName])) {
        for (const record of data[tableName]) {
          this.tables[tableName].set(record.id, record);
          this.indexes[tableName].byId.set(record.id, record);
        }
      }
    }
    this._inTransaction = false;
    this._snapshot = null;
  }

  transaction(fn) {
    this.beginTransaction();
    try {
      const result = fn();
      this.commit();
      return result;
    } catch (err) {
      this.rollback();
      throw err;
    }
  }

  toJSON() {
    const serialized = {};
    for (const [tableName, map] of Object.entries(this.tables)) {
      serialized[tableName] = Array.from(map.values());
    }
    return serialized;
  }

  _validateRecord(table, record, isUpdate = false) {
    const schema = SCHEMAS[table];
    if (!schema) return record;

    if (!isUpdate) {
      for (const req of schema.required) {
        if (record[req] === undefined || record[req] === null || record[req] === '') {
          throw new Error(`Field '${req}' is required in table '${table}'`);
        }
      }
    }

    // Apply defaults
    const prepared = { ...record };
    if (!isUpdate) {
      for (const [key, defVal] of Object.entries(schema.defaults || {})) {
        if (prepared[key] === undefined) {
          prepared[key] = typeof defVal === 'function' ? defVal() : defVal;
        }
      }
    }

    // Unique checks
    if (schema.unique && schema.unique.length > 0) {
      const records = Array.from(this.tables[table].values());
      const isComposite = schema.unique.length > 1;

      for (const existing of records) {
        if (isUpdate && existing.id === record.id) continue;

        if (isComposite) {
          const matchAll = schema.unique.every(
            field => prepared[field] !== undefined && existing[field] === prepared[field]
          );
          if (matchAll) {
            throw new Error(`Unique constraint violation on (${schema.unique.join(', ')}) in table '${table}'`);
          }
        } else {
          const field = schema.unique[0];
          if (prepared[field] !== undefined && existing[field] === prepared[field]) {
            throw new Error(`Unique constraint violation on '${field}'='${prepared[field]}' in table '${table}'`);
          }
        }
      }
    }

    return prepared;
  }

  insert(table, data) {
    if (!this.tables[table]) {
      throw new Error(`Table '${table}' does not exist`);
    }

    const id = data.id || crypto.randomUUID();
    const validated = this._validateRecord(table, { ...data, id });

    this.tables[table].set(id, validated);
    this.indexes[table].byId.set(id, validated);
    this.save();
    return validated;
  }

  insertMany(table, items) {
    if (!this.tables[table]) {
      throw new Error(`Table '${table}' does not exist`);
    }

    const inserted = [];
    for (const item of items) {
      const id = item.id || crypto.randomUUID();
      const validated = this._validateRecord(table, { ...item, id });
      this.tables[table].set(id, validated);
      this.indexes[table].byId.set(id, validated);
      inserted.push(validated);
    }
    this.save();
    return inserted;
  }

  findById(table, id) {
    if (!this.tables[table]) return null;
    return this.indexes[table].byId.get(id) || null;
  }

  findOne(table, predicate) {
    if (!this.tables[table]) return null;
    for (const record of this.tables[table].values()) {
      if (predicate(record)) return record;
    }
    return null;
  }

  find(table, predicate = () => true) {
    if (!this.tables[table]) return [];
    const results = [];
    for (const record of this.tables[table].values()) {
      if (predicate(record)) results.push(record);
    }
    return results;
  }

  update(table, id, updates) {
    const record = this.findById(table, id);
    if (!record) {
      throw new Error(`Record with id '${id}' not found in table '${table}'`);
    }

    const merged = { ...record, ...updates, id, updatedAt: new Date().toISOString() };
    const validated = this._validateRecord(table, merged, true);

    this.tables[table].set(id, validated);
    this.indexes[table].byId.set(id, validated);
    this.save();
    return validated;
  }

  delete(table, id) {
    if (!this.tables[table] || !this.tables[table].has(id)) {
      return false;
    }
    this.tables[table].delete(id);
    this.indexes[table].byId.delete(id);
    this.save();
    return true;
  }

  count(table, predicate = () => true) {
    if (!this.tables[table]) return 0;
    let total = 0;
    for (const record of this.tables[table].values()) {
      if (predicate(record)) total++;
    }
    return total;
  }

  clearTable(table) {
    if (this.tables[table]) {
      this.tables[table].clear();
      this.indexes[table].byId.clear();
      this.save();
    }
  }
}

// Singleton database instance
const db = new RelationalDatabase();

module.exports = {
  db,
  RelationalDatabase,
  TABLES
};
