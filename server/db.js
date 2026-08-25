import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const CANONICAL_UNITS = "'un','kg','g','l','ml'";
const STORAGE_LOCATIONS = "'despensa','geladeira','freezer','fruteira','bancada','outro'";

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'sous.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      unit TEXT NOT NULL DEFAULT 'un' CHECK (unit IN (${CANONICAL_UNITS})),
      min_quantity REAL NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
      storage_location TEXT NOT NULL DEFAULT 'despensa' CHECK (storage_location IN (${STORAGE_LOCATIONS})),
      expires_on TEXT,
      expiry_estimated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shopping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
      unit TEXT NOT NULL DEFAULT 'un' CHECK (unit IN (${CANONICAL_UNITS})),
      checked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const columns = new Set(db.prepare('PRAGMA table_info(inventory)').all().map((column) => column.name));
  if (!columns.has('storage_location')) db.exec("ALTER TABLE inventory ADD COLUMN storage_location TEXT NOT NULL DEFAULT 'despensa'");
  if (!columns.has('expiry_estimated')) db.exec('ALTER TABLE inventory ADD COLUMN expiry_estimated INTEGER NOT NULL DEFAULT 0');

  // Normaliza dados legados para o conjunto canônico de unidades e locais.
  db.prepare(`UPDATE inventory SET unit = 'un' WHERE unit NOT IN (${CANONICAL_UNITS})`).run();
  db.prepare(`UPDATE shopping SET unit = 'un' WHERE unit NOT IN (${CANONICAL_UNITS})`).run();
  db.prepare(`UPDATE inventory SET storage_location = 'despensa' WHERE storage_location NOT IN (${STORAGE_LOCATIONS})`).run();

  return db;
}