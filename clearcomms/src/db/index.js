"use strict";
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dataDir = process.env.DATABASE_DIR || path.join(__dirname, "..", "..", "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "clearcomms.sqlite");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Idempotent migration: safe to run on every boot.
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

// Additive column migrations. CREATE TABLE IF NOT EXISTS cannot add columns to
// a table that already exists, so new columns are added here, guarded so the
// migration is safe to run on every boot.
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
addColumnIfMissing("users", "status", "status TEXT NOT NULL DEFAULT 'active'");

module.exports = db;
