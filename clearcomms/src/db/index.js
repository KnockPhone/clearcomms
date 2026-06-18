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

module.exports = db;
