const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.dirname(process.env.DB_PATH || './data/tickets.db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(process.env.DB_PATH || './data/tickets.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS verifications (
    id          TEXT PRIMARY KEY,
    ticket_type TEXT NOT NULL,
    ticket_code TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_name  TEXT,
    image_path   TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    amount       TEXT,
    admin_note   TEXT,
    admin_token  TEXT UNIQUE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    verification_id TEXT NOT NULL,
    action         TEXT NOT NULL,
    details        TEXT,
    ip             TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
