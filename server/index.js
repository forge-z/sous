import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { openDatabase } from './db.js';
import { parseCommands, canonicalUnit } from './parser.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const now = () => new Date().toISOString();
const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
const invalid = (message) => Object.assign(new Error(message), { statusCode: 422 });
const idOf = (value) => (Number.isInteger(Number(value)) ? Number(value) : 0);
const STORAGE_LOCATIONS = new Set(['despensa', 'geladeira', 'freezer', 'fruteira', 'bancada', 'outro']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function quantityOf(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw invalid('Quantidade deve ser um número maior ou igual a zero.');
  return parsed;
}

function unitOf(value) {
  if (value === undefined || value === null || value === '') return 'un';
  const unit = canonicalUnit(value);
  if (!unit) throw invalid('Unidade inválida. Use: un, kg, g, l ou ml.');
  return unit;
}

function dateOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!DATE_RE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw invalid('Data de validade inválida. Use o formato AAAA-MM-DD.');
  }
  return text;
}

function normalizedText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeStorage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return STORAGE_LOCATIONS.has(normalized) ? normalized : 'despensa';
}

function inferStorageLocation(name) {
  const value = normalizedText(name);
  if (/(?:congelad|sorvete|gelo|polpa)/.test(value)) return 'freezer';
  if (/\b(?:contra[- ]?file|carne|frango|peixe|presunto|linguica|picanha|bife|alcatra|patinho|acem)\b/.test(value)) return 'geladeira';
  if (/\b(?:leite)\b/.test(value)) return /\b(?:abert[oa]?|abri[ur]?)\b/.test(value) ? 'geladeira' : 'despensa';
  if (/\b(?:queijo|iogurte|manteiga|requeijao|creme de leite|ovo|tofu)\b/.test(value)) return 'geladeira';
  if (/\b(?:banana|maca|laranja|limao|abacate|manga|mamao|pera)\b/.test(value)) return 'fruteira';
  return 'despensa';
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function estimateExpiry(name, storage) {
  const value = normalizedText(name);
  if (storage === 'freezer') return addDays(90);
  if (storage !== 'geladeira') return null;
  if (/\b(?:contra[- ]?file|carne|frango|peixe|presunto|linguica|picanha|bife|alcatra|patinho|acem)\b/.test(value)) return addDays(3);
  if (/\b(?:leite|queijo|iogurte|manteiga|requeijao|creme|ovo)\b/.test(value)) return addDays(7);
  return addDays(5);
}

function inventoryMeta(body, existing = null) {
  const name = cleanName(body?.name ?? existing?.name);
  const storage = body?.storage_location === undefined
    ? (existing?.storage_location || inferStorageLocation(name))
    : body.storage_location ? normalizeStorage(body.storage_location) : inferStorageLocation(name);

  // Sem `expires_on` no corpo a validade guardada permanece intacta: ajustar a
  // quantidade ou renomear um item não pode adiar uma estimativa já vencida.
  if (existing && body?.expires_on === undefined) {
    return { storage_location: storage, expires_on: existing.expires_on ?? null, expiry_estimated: existing.expiry_estimated ?? 0 };
  }

  const requested = String(body?.expires_on ?? '').trim();
  if (requested) {
    const expiresOn = dateOf(requested);
    // Reenviar a data já gravada não converte uma estimativa em data confirmada.
    const wasEstimated = existing?.expires_on === expiresOn ? existing.expiry_estimated ?? 0 : 0;
    return { storage_location: storage, expires_on: expiresOn, expiry_estimated: wasEstimated };
  }

  if (existing) return { storage_location: storage, expires_on: null, expiry_estimated: 0 };

  const expiresOn = body?.auto_expiry === false || body?.auto_expiry === 'false' ? null : estimateExpiry(name, storage);
  return { storage_location: storage, expires_on: expiresOn, expiry_estimated: expiresOn ? 1 : 0 };
}

function inventoryView(row) {
  return { ...row, low_stock: Number(row.quantity) <= Number(row.min_quantity) };
}

function shoppingView(row) {
  return { ...row, checked: Boolean(row.checked) };
}

const inventoryById = (db, id) => db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
const shoppingById = (db, id) => db.prepare('SELECT * FROM shopping WHERE id = ?').get(id);

// Quantidades de mesma grandeza se somam; 'un' só soma com 'un'.
const UNIT_SCALES = new Map([['un', ['un', 1]], ['g', ['massa', 1]], ['kg', ['massa', 1000]], ['ml', ['volume', 1]], ['l', ['volume', 1000]]]);
const roundQuantity = (value) => Math.round(value * 1000) / 1000;

function convertQuantity(quantity, from, to) {
  if (from === to) return quantity;
  return roundQuantity((quantity * UNIT_SCALES.get(from)[1]) / UNIT_SCALES.get(to)[1]);
}

function findMergeable(rows, name, unit) {
  const key = normalizedText(name);
  const [dimension] = UNIT_SCALES.get(unit);
  return rows.find((row) => normalizedText(row.name) === key && UNIT_SCALES.get(row.unit)?.[0] === dimension) ?? null;
}

function transaction(db, run) {
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

// Repetir um item conhecido soma ao que já existe em vez de criar uma linha duplicada.
function addInventory(db, body) {
  const name = cleanName(body?.name);
  if (!name) throw invalid('Informe o nome do item.');
  const quantity = quantityOf(body.quantity, 1);
  const unit = unitOf(body.unit);
  const timestamp = now();

  const existing = findMergeable(db.prepare('SELECT * FROM inventory').all(), name, unit);
  if (existing) {
    const total = roundQuantity(Number(existing.quantity) + convertQuantity(quantity, unit, existing.unit));
    const meta = inventoryMeta({ ...body, name: existing.name, storage_location: body?.storage_location || undefined }, existing);
    const minQuantity = body?.min_quantity === undefined ? existing.min_quantity : quantityOf(body.min_quantity, existing.min_quantity);
    db.prepare('UPDATE inventory SET quantity = ?, min_quantity = ?, storage_location = ?, expires_on = ?, expiry_estimated = ?, updated_at = ? WHERE id = ?')
      .run(total, minQuantity, meta.storage_location, meta.expires_on, meta.expiry_estimated, timestamp, existing.id);
    return { item: inventoryView(inventoryById(db, existing.id)), merged: true };
  }

  const meta = inventoryMeta({ ...body, name });
  const result = db.prepare(`INSERT INTO inventory (name, quantity, unit, min_quantity, storage_location, expires_on, expiry_estimated, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, quantity, unit, quantityOf(body.min_quantity, 0), meta.storage_location, meta.expires_on, meta.expiry_estimated, timestamp, timestamp);
  return { item: inventoryView(inventoryById(db, Number(result.lastInsertRowid))), merged: false };
}

function addShopping(db, body) {
  const name = cleanName(body?.name);
  if (!name) throw invalid('Informe o nome do item.');
  const quantity = quantityOf(body.quantity, 1);
  const unit = unitOf(body.unit);
  const timestamp = now();

  // Um item já marcado como comprado não recebe a soma: ele volta como pendente.
  const existing = findMergeable(db.prepare('SELECT * FROM shopping WHERE checked = 0').all(), name, unit);
  if (existing) {
    const total = roundQuantity(Number(existing.quantity) + convertQuantity(quantity, unit, existing.unit));
    db.prepare('UPDATE shopping SET quantity = ?, updated_at = ? WHERE id = ?').run(total, timestamp, existing.id);
    return { item: shoppingView(shoppingById(db, existing.id)), merged: true };
  }

  const result = db.prepare(`INSERT INTO shopping (name, quantity, unit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(name, quantity, unit, timestamp, timestamp);
  return { item: shoppingView(shoppingById(db, Number(result.lastInsertRowid))), merged: false };
}

function listNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

function handleError(reply, error) {
  return reply.code(error.statusCode || 400).send({ error: error.message });
}

export async function buildApp(options = {}) {
  const { dataDir, logger = process.env.NODE_ENV !== 'test' } = options;
  const app = Fastify({ logger });
  const db = openDatabase(dataDir);
  app.addHook('onClose', () => { try { db.close(); } catch { /* já fechado */ } });

  app.get('/healthz', async () => ({ status: 'ok', service: 'sous-lite' }));

  app.get('/api/inventory', async () => ({ items: db.prepare('SELECT * FROM inventory ORDER BY (quantity <= min_quantity) DESC, name COLLATE NOCASE').all().map(inventoryView) }));
  app.post('/api/inventory', async (request, reply) => {
    try {
      const { item, merged } = addInventory(db, request.body || {});
      return reply.code(merged ? 200 : 201).send({ item, merged });
    } catch (error) { return handleError(reply, error); }
  });
  app.patch('/api/inventory/:id', async (request, reply) => {
    const id = idOf(request.params.id);
    const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Item não encontrado.' });
    const body = request.body || {};
    try {
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
      db.prepare('UPDATE inventory SET name = ?, quantity = ?, unit = ?, min_quantity = ?, storage_location = ?, expires_on = ?, expiry_estimated = ?, updated_at = ? WHERE id = ?')
        .run(updated.name, updated.quantity, updated.unit, updated.min_quantity, updated.storage_location, updated.expires_on, updated.expiry_estimated, now(), id);
      return { item: inventoryView(db.prepare('SELECT * FROM inventory WHERE id = ?').get(id)) };
    } catch (error) { return handleError(reply, error); }
  });
  app.delete('/api/inventory/:id', async (request, reply) => {
    const result = db.prepare('DELETE FROM inventory WHERE id = ?').run(idOf(request.params.id));
    if (!result.changes) return reply.code(404).send({ error: 'Item não encontrado.' });
    return { ok: true };
  });

  app.get('/api/shopping', async () => ({ items: db.prepare('SELECT * FROM shopping ORDER BY checked ASC, name COLLATE NOCASE').all().map(shoppingView) }));
  app.post('/api/shopping', async (request, reply) => {
    try {
      const { item, merged } = addShopping(db, request.body || {});
      return reply.code(merged ? 200 : 201).send({ item, merged });
    } catch (error) { return handleError(reply, error); }
  });
  app.patch('/api/shopping/:id', async (request, reply) => {
    const id = idOf(request.params.id);
    const existing = db.prepare('SELECT * FROM shopping WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Item não encontrado.' });
    const body = request.body || {};
    try {
      const name = body.name === undefined ? existing.name : cleanName(body.name);
      if (!name) throw invalid('Informe o nome do item.');
      db.prepare('UPDATE shopping SET name = ?, quantity = ?, unit = ?, checked = ?, updated_at = ? WHERE id = ?')
        .run(name, body.quantity === undefined ? existing.quantity : quantityOf(body.quantity, existing.quantity),
          body.unit === undefined ? existing.unit : unitOf(body.unit),
          body.checked === undefined ? existing.checked : body.checked ? 1 : 0, now(), id);
      return { item: shoppingView(db.prepare('SELECT * FROM shopping WHERE id = ?').get(id)) };
    } catch (error) { return handleError(reply, error); }
  });
  app.delete('/api/shopping/:id', async (request, reply) => {
    const result = db.prepare('DELETE FROM shopping WHERE id = ?').run(idOf(request.params.id));
    if (!result.changes) return reply.code(404).send({ error: 'Item não encontrado.' });
    return { ok: true };
  });

  // Fecha a compra: o que foi marcado na lista entra no estoque e sai da lista.
  app.post('/api/shopping/checkout', async (request, reply) => {
    const purchased = db.prepare('SELECT * FROM shopping WHERE checked = 1 ORDER BY name COLLATE NOCASE').all();
    if (!purchased.length) return reply.code(422).send({ error: 'Marque os itens comprados antes de mover para o estoque.' });
    try {
      const items = transaction(db, () => purchased.map((row) => {
        const { item } = addInventory(db, { name: row.name, quantity: row.quantity, unit: row.unit });
        db.prepare('DELETE FROM shopping WHERE id = ?').run(row.id);
        return item;
      }));
      return { moved: items.length, items };
    } catch (error) { return handleError(reply, error); }
  });

  app.post('/api/commands', async (request, reply) => {
    const actions = parseCommands(request.body?.text);
    if (!actions?.length) return reply.code(422).send({ error: 'Não entendi. Use: “comprei 2 kg de arroz” ou “comprar 1 leite”.' });
    try {
      const items = transaction(db, () => actions.map((action) => (
        action.type === 'inventory.add' ? addInventory(db, action).item : addShopping(db, action).item
      )));
      return { action: actions.length === 1 ? actions[0].type : 'batch', items, item: items[0] };
    } catch (error) { return handleError(reply, error); }
  });

  app.post('/api/cook', async () => {
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
  });

  await app.register(fastifyStatic, { root: path.join(root, '..', 'dist'), prefix: '/' });

  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dataDir = process.env.DATA_DIR || path.join(root, '..', 'data');
  const app = await buildApp({ dataDir });
  const port = Number(process.env.APP_PORT || 3000);
  const host = process.env.APP_HOST || '0.0.0.0';
  await app.listen({ port, host });

  const shutdown = () => app.close().finally(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}