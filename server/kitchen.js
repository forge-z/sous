import { parseCommands, canonicalUnit } from './parser.js';

const STORAGE_LOCATIONS = new Set(['despensa', 'geladeira', 'freezer', 'fruteira', 'bancada', 'outro']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNIT_SCALES = new Map([['un', ['un', 1]], ['g', ['massa', 1]], ['kg', ['massa', 1000]], ['ml', ['volume', 1]], ['l', ['volume', 1000]]]);
const USAGE_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;

export const now = () => new Date().toISOString();
export const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
export const invalid = (message) => Object.assign(new Error(message), { statusCode: 422 });
export const idOf = (value) => (Number.isInteger(Number(value)) ? Number(value) : 0);
export const roundQuantity = (value) => Math.round(value * 1000) / 1000;

export function quantityOf(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw invalid('Quantidade deve ser um número maior ou igual a zero.');
  return parsed;
}

export function unitOf(value) {
  if (value === undefined || value === null || value === '') return 'un';
  const unit = canonicalUnit(value);
  if (!unit) throw invalid('Unidade inválida. Use: un, kg, g, l ou ml.');
  return unit;
}

export function dateOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!DATE_RE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw invalid('Data de validade inválida. Use o formato AAAA-MM-DD.');
  }
  return text;
}

export function normalizedText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeStorage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return STORAGE_LOCATIONS.has(normalized) ? normalized : 'despensa';
}

export function inferStorageLocation(name) {
  const value = normalizedText(name);
  if (/(?:congelad|sorvete|gelo|polpa)/.test(value)) return 'freezer';
  if (/\b(?:contra[- ]?file|carne|frango|peixe|presunto|linguica|picanha|bife|alcatra|patinho|acem)\b/.test(value)) return 'geladeira';
  if (/\b(?:leite)\b/.test(value)) return /\b(?:abert[oa]?|abri[ur]?)\b/.test(value) ? 'geladeira' : 'despensa';
  if (/\b(?:queijo|iogurte|manteiga|requeijao|ovo|tofu)\b/.test(value)) return 'geladeira';
  if (/\b(?:banana|maca|laranja|limao|abacate|manga|mamao|pera)\b/.test(value)) return 'fruteira';
  return 'despensa';
}

export function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function estimateExpiry(name, storage) {
  const value = normalizedText(name);
  if (storage === 'freezer') return addDays(90);
  if (storage !== 'geladeira') return null;
  if (/\b(?:contra[- ]?file|carne|frango|peixe|presunto|linguica|picanha|bife|alcatra|patinho|acem)\b/.test(value)) return addDays(3);
  if (/\b(?:leite|queijo|iogurte|manteiga|requeijao|creme|ovo)\b/.test(value)) return addDays(7);
  return addDays(5);
}

export function inventoryMeta(body, existing = null) {
  const name = cleanName(body?.name ?? existing?.name);
  const storage = body?.storage_location === undefined
    ? (existing?.storage_location || inferStorageLocation(name))
    : body.storage_location ? normalizeStorage(body.storage_location) : inferStorageLocation(name);

  if (existing && body?.expires_on === undefined) {
    return { storage_location: storage, expires_on: existing.expires_on ?? null, expiry_estimated: existing.expiry_estimated ?? 0 };
  }

  const requested = String(body?.expires_on ?? '').trim();
  if (requested) {
    const expiresOn = dateOf(requested);
    const wasEstimated = existing?.expires_on === expiresOn ? existing.expiry_estimated ?? 0 : 0;
    return { storage_location: storage, expires_on: expiresOn, expiry_estimated: wasEstimated };
  }

  if (existing) return { storage_location: storage, expires_on: null, expiry_estimated: 0 };

  const expiresOn = body?.auto_expiry === false || body?.auto_expiry === 'false' ? null : estimateExpiry(name, storage);
  return { storage_location: storage, expires_on: expiresOn, expiry_estimated: expiresOn ? 1 : 0 };
}

export function convertQuantity(quantity, from, to) {
  if (from === to) return quantity;
  return roundQuantity((quantity * UNIT_SCALES.get(from)[1]) / UNIT_SCALES.get(to)[1]);
}

export function findMergeable(rows, name, unit) {
  const key = normalizedText(name);
  const [dimension] = UNIT_SCALES.get(unit);
  return rows.find((row) => normalizedText(row.name) === key && UNIT_SCALES.get(row.unit)?.[0] === dimension) ?? null;
}

export function transaction(db, run) {
  db.exec('BEGIN');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const inventoryById = (db, id) => db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
export const shoppingById = (db, id) => db.prepare('SELECT * FROM shopping WHERE id = ?').get(id);

function usageKey(name, unit) {
  return `${normalizedText(name)}::${UNIT_SCALES.get(unit)?.[0] ?? 'un'}`;
}

export function weeklyUsageMap(db) {
  const since = new Date(Date.now() - USAGE_WINDOW_MS).toISOString();
  const rows = db.prepare('SELECT name, unit, delta FROM movements WHERE delta < 0 AND created_at >= ?').all(since);
  const totals = new Map();
  for (const row of rows) {
    const scale = UNIT_SCALES.get(row.unit);
    if (!scale) continue;
    totals.set(usageKey(row.name, row.unit), (totals.get(usageKey(row.name, row.unit)) || 0) + (-Number(row.delta) * scale[1]));
  }
  const weekly = new Map();
  for (const [key, total] of totals) weekly.set(key, roundQuantity(total / 4));
  return weekly;
}

export function weeklyUsageFor(row, usage) {
  const scale = UNIT_SCALES.get(row.unit);
  if (!scale) return 0;
  return roundQuantity((usage.get(usageKey(row.name, row.unit)) || 0) / scale[1]);
}

export function inventoryView(row, usage = new Map()) {
  const weekly_usage = weeklyUsageFor(row, usage);
  const restock_quantity = roundQuantity(Math.max(
    Number(row.min_quantity) - Number(row.quantity),
    weekly_usage - Number(row.quantity),
    1,
  ));
  return { ...row, low_stock: Number(row.quantity) <= Number(row.min_quantity), weekly_usage, restock_quantity };
}

export function shoppingView(row) {
  return { ...row, checked: Boolean(row.checked) };
}

export function logMovement(db, name, delta, unit, createdAt = now()) {
  if (!name || !Number.isFinite(Number(delta)) || Number(delta) === 0) return;
  db.prepare('INSERT INTO movements (name, delta, unit, created_at) VALUES (?, ?, ?, ?)')
    .run(cleanName(name), roundQuantity(Number(delta)), unitOf(unit), createdAt);
}

function insertInventoryRow(db, fields) {
  const timestamp = now();
  const result = db.prepare(`INSERT INTO inventory (name, quantity, unit, min_quantity, storage_location, expires_on, expiry_estimated, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      fields.name,
      fields.quantity,
      fields.unit,
      fields.min_quantity,
      fields.storage_location,
      fields.expires_on,
      fields.expiry_estimated ? 1 : 0,
      fields.created_at || timestamp,
      timestamp,
    );
  return inventoryById(db, Number(result.lastInsertRowid));
}

function insertShoppingRow(db, fields) {
  const timestamp = now();
  const result = db.prepare(`INSERT INTO shopping (name, quantity, unit, checked, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      fields.name,
      fields.quantity,
      fields.unit,
      fields.checked ? 1 : 0,
      fields.created_at || timestamp,
      timestamp,
    );
  return shoppingById(db, Number(result.lastInsertRowid));
}

export function listInventory(db) {
  const usage = weeklyUsageMap(db);
  return db.prepare('SELECT * FROM inventory ORDER BY (quantity <= min_quantity) DESC, name COLLATE NOCASE').all()
    .map((row) => inventoryView(row, usage));
}

export function listShopping(db) {
  return db.prepare('SELECT * FROM shopping ORDER BY checked ASC, name COLLATE NOCASE').all().map(shoppingView);
}

export function addInventory(db, body) {
  const name = cleanName(body?.name);
  if (!name) throw invalid('Informe o nome do item.');
  const quantity = quantityOf(body.quantity, 1);
  const unit = unitOf(body.unit);
  const timestamp = now();

  const existing = findMergeable(db.prepare('SELECT * FROM inventory').all(), name, unit);
  if (existing) {
    const total = roundQuantity(Number(existing.quantity) + convertQuantity(quantity, unit, existing.unit));
    const meta = inventoryMeta({
      ...body,
      name: existing.name,
      storage_location: body?.storage_location || undefined,
      expires_on: String(body?.expires_on ?? '').trim() || undefined,
    }, existing);
    const minQuantity = body?.min_quantity === undefined ? existing.min_quantity : quantityOf(body.min_quantity, existing.min_quantity);
    db.prepare('UPDATE inventory SET quantity = ?, min_quantity = ?, storage_location = ?, expires_on = ?, expiry_estimated = ?, updated_at = ? WHERE id = ?')
      .run(total, minQuantity, meta.storage_location, meta.expires_on, meta.expiry_estimated, timestamp, existing.id);
    return { item: inventoryView(inventoryById(db, existing.id), weeklyUsageMap(db)), merged: true };
  }

  const meta = inventoryMeta({ ...body, name });
  const row = insertInventoryRow(db, {
    name,
    quantity,
    unit,
    min_quantity: quantityOf(body.min_quantity, 0),
    storage_location: meta.storage_location,
    expires_on: meta.expires_on,
    expiry_estimated: meta.expiry_estimated,
  });
  return { item: inventoryView(row, weeklyUsageMap(db)), merged: false };
}

export function addShopping(db, body) {
  const name = cleanName(body?.name);
  if (!name) throw invalid('Informe o nome do item.');
  const quantity = quantityOf(body.quantity, 1);
  const unit = unitOf(body.unit);
  const timestamp = now();

  const existing = findMergeable(db.prepare('SELECT * FROM shopping WHERE checked = 0').all(), name, unit);
  if (existing) {
    const total = roundQuantity(Number(existing.quantity) + convertQuantity(quantity, unit, existing.unit));
    db.prepare('UPDATE shopping SET quantity = ?, updated_at = ? WHERE id = ?').run(total, timestamp, existing.id);
    return { item: shoppingView(shoppingById(db, existing.id)), merged: true };
  }

  return { item: shoppingView(insertShoppingRow(db, { name, quantity, unit, checked: 0 })), merged: false };
}

export function updateInventory(db, id, body) {
  const existing = inventoryById(db, id);
  if (!existing) return null;
  const name = body.name === undefined ? existing.name : cleanName(body.name);
  if (!name) throw invalid('Informe o nome do item.');
  const meta = inventoryMeta(body, existing);
  const updated = {
    name,
    quantity: body.quantity === undefined ? existing.quantity : quantityOf(body.quantity, existing.quantity),
    unit: body.unit === undefined ? existing.unit : unitOf(body.unit),
    min_quantity: body.min_quantity === undefined ? existing.min_quantity : quantityOf(body.min_quantity, existing.min_quantity),
    storage_location: meta.storage_location,
    expires_on: meta.expires_on,
    expiry_estimated: meta.expiry_estimated,
  };

  const previous = UNIT_SCALES.get(existing.unit) && UNIT_SCALES.get(updated.unit)
    ? convertQuantity(Number(existing.quantity), existing.unit, updated.unit)
    : Number(existing.quantity);
  const delta = roundQuantity(Number(updated.quantity) - previous);
  if (delta < 0) logMovement(db, existing.name, delta, updated.unit);

  db.prepare('UPDATE inventory SET name = ?, quantity = ?, unit = ?, min_quantity = ?, storage_location = ?, expires_on = ?, expiry_estimated = ?, updated_at = ? WHERE id = ?')
    .run(updated.name, updated.quantity, updated.unit, updated.min_quantity, updated.storage_location, updated.expires_on, updated.expiry_estimated, now(), id);
  return inventoryView(inventoryById(db, id), weeklyUsageMap(db));
}

export function updateShopping(db, id, body) {
  const existing = shoppingById(db, id);
  if (!existing) return null;
  const name = body.name === undefined ? existing.name : cleanName(body.name);
  if (!name) throw invalid('Informe o nome do item.');
  db.prepare('UPDATE shopping SET name = ?, quantity = ?, unit = ?, checked = ?, updated_at = ? WHERE id = ?')
    .run(
      name,
      body.quantity === undefined ? existing.quantity : quantityOf(body.quantity, existing.quantity),
      body.unit === undefined ? existing.unit : unitOf(body.unit),
      body.checked === undefined ? existing.checked : body.checked ? 1 : 0,
      now(),
      id,
    );
  return shoppingView(shoppingById(db, id));
}

export function removeInventory(db, id) {
  const existing = inventoryById(db, id);
  if (!existing) return null;
  db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
  return inventoryView(existing);
}

export function removeShopping(db, id) {
  const existing = shoppingById(db, id);
  if (!existing) return null;
  db.prepare('DELETE FROM shopping WHERE id = ?').run(id);
  return shoppingView(existing);
}

export function restoreInventory(db, body) {
  const name = cleanName(body?.name);
  if (!name) throw invalid('Informe o nome do item.');
  const quantity = quantityOf(body.quantity, 1);
  const unit = unitOf(body.unit);
  const storage = body?.storage_location ? normalizeStorage(body.storage_location) : inferStorageLocation(name);
  const expiresOn = body?.expires_on ? dateOf(body.expires_on) : null;
  const row = insertInventoryRow(db, {
    name,
    quantity,
    unit,
    min_quantity: quantityOf(body.min_quantity, 0),
    storage_location: storage,
    expires_on: expiresOn,
    expiry_estimated: body?.expiry_estimated ? 1 : 0,
    created_at: body?.created_at,
  });
  return inventoryView(row, weeklyUsageMap(db));
}

export function restoreShopping(db, body) {
  const name = cleanName(body?.name);
  if (!name) throw invalid('Informe o nome do item.');
  return shoppingView(insertShoppingRow(db, {
    name,
    quantity: quantityOf(body.quantity, 1),
    unit: unitOf(body.unit),
    checked: Boolean(body?.checked),
    created_at: body?.created_at,
  }));
}

export function checkoutShopping(db) {
  const purchased = db.prepare('SELECT * FROM shopping WHERE checked = 1 ORDER BY name COLLATE NOCASE').all();
  if (!purchased.length) throw invalid('Marque os itens comprados antes de mover para o estoque.');
  return transaction(db, () => purchased.map((row) => {
    const { item } = addInventory(db, { name: row.name, quantity: row.quantity, unit: row.unit });
    db.prepare('DELETE FROM shopping WHERE id = ?').run(row.id);
    return item;
  }));
}

export function applyCommands(db, text) {
  const actions = parseCommands(text);
  if (!actions?.length) throw invalid('Não entendi. Use: “comprei 2 kg de arroz” ou “comprar 1 leite”.');
  return transaction(db, () => {
    const items = actions.map((action) => (
      action.type === 'inventory.add' ? addInventory(db, action).item : addShopping(db, action).item
    ));
    return { action: actions.length === 1 ? actions[0].type : 'batch', items, item: items[0] };
  });
}

export function listNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

export function cookSuggestion(db) {
  const rows = db.prepare('SELECT name, expires_on FROM inventory WHERE quantity > 0 ORDER BY updated_at DESC').all();
  if (!rows.length) return { suggestion: 'Adicione alguns itens ao estoque para receber uma sugestão.', priority: [] };

  const deadline = addDays(3);
  const urgent = rows
    .filter((row) => row.expires_on && row.expires_on <= deadline)
    .sort((a, b) => a.expires_on.localeCompare(b.expires_on))
    .slice(0, 5);
  const names = (urgent.length ? urgent : rows.slice(0, 5)).map((row) => row.name);

  return {
    suggestion: urgent.length
      ? `Comece por ${listNames(names)}, que ${urgent.length === 1 ? 'está' : 'estão'} perto do vencimento: refogue o que precisa de cocção, tempere com o que houver na despensa e sirva em seguida.`
      : `Sugestão simples com ${listNames(names)}: refogue os ingredientes, ajuste o sal e finalize com o que tiver fresco.`,
    priority: urgent.map((row) => row.name),
  };
}

export function exportBackup(db) {
  return {
    version: 1,
    exported_at: now(),
    inventory: db.prepare('SELECT name, quantity, unit, min_quantity, storage_location, expires_on, expiry_estimated, created_at, updated_at FROM inventory ORDER BY name COLLATE NOCASE').all(),
    shopping: db.prepare('SELECT name, quantity, unit, checked, created_at, updated_at FROM shopping ORDER BY name COLLATE NOCASE').all(),
    movements: db.prepare('SELECT name, delta, unit, created_at FROM movements ORDER BY created_at ASC').all(),
  };
}

export function importBackup(db, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw invalid('Backup inválido. Envie um objeto com inventory e shopping.');
  }
  if (!Array.isArray(payload.inventory) || !Array.isArray(payload.shopping)) {
    throw invalid('Backup inválido. Envie inventory e shopping como listas.');
  }
  const movements = Array.isArray(payload.movements) ? payload.movements : [];

  return transaction(db, () => {
    db.exec('DELETE FROM inventory; DELETE FROM shopping; DELETE FROM movements;');
    const inventory = payload.inventory.map((row) => restoreInventory(db, row));
    const shopping = payload.shopping.map((row) => restoreShopping(db, row));
    for (const row of movements) {
      logMovement(db, row.name, Number(row.delta), row.unit || 'un', row.created_at || now());
    }
    return { imported: { inventory: inventory.length, shopping: shopping.length, movements: movements.length } };
  });
}
