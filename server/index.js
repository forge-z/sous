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
  const rawExpiry = body?.expires_on ?? '';
  const explicitExpiry = rawExpiry || (existing?.expiry_estimated ? null : existing?.expires_on) || null;
  const shouldEstimate = body?.auto_expiry !== false;
  const expiresOn = explicitExpiry ? dateOf(explicitExpiry) : shouldEstimate ? estimateExpiry(name, storage) : null;
  return { storage_location: storage, expires_on: expiresOn, expiry_estimated: explicitExpiry ? 0 : expiresOn ? 1 : 0 };
}

function inventoryView(row) {
  return { ...row, low_stock: Number(row.quantity) <= Number(row.min_quantity) };
}

function shoppingView(row) {
  return { ...row, checked: Boolean(row.checked) };
}

function addInventory(db, body) {
  const name = cleanName(body?.name);
  if (!name) throw invalid('Informe o nome do item.');
  const meta = inventoryMeta({ ...body, name });
  const timestamp = now();
  const result = db.prepare(`INSERT INTO inventory (name, quantity, unit, min_quantity, storage_location, expires_on, expiry_estimated, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, quantityOf(body.quantity, 1), unitOf(body.unit), quantityOf(body.min_quantity, 0), meta.storage_location, meta.expires_on, meta.expiry_estimated, timestamp, timestamp);
  return inventoryView(db.prepare('SELECT * FROM inventory WHERE id = ?').get(Number(result.lastInsertRowid)));
}

function addShopping(db, body) {
  const name = cleanName(body?.name);
  if (!name) throw invalid('Informe o nome do item.');
  const timestamp = now();
  const result = db.prepare(`INSERT INTO shopping (name, quantity, unit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(name, quantityOf(body.quantity, 1), unitOf(body.unit), timestamp, timestamp);
  return shoppingView(db.prepare('SELECT * FROM shopping WHERE id = ?').get(Number(result.lastInsertRowid)));
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
    try { return reply.code(201).send({ item: addInventory(db, request.body || {}) }); }
    catch (error) { return handleError(reply, error); }
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
    try { return reply.code(201).send({ item: addShopping(db, request.body || {}) }); }
    catch (error) { return handleError(reply, error); }
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

  app.post('/api/commands', async (request, reply) => {
    const actions = parseCommands(request.body?.text);
    if (!actions?.length) return reply.code(422).send({ error: 'Não entendi. Use: “comprei 2 kg de arroz” ou “comprar 1 leite”.' });
    try {
      const items = actions.map((action) => (action.type === 'inventory.add' ? addInventory(db, action) : addShopping(db, action)));
      return { action: actions.length === 1 ? actions[0].type : 'batch', items, item: items[0] };
    } catch (error) { return handleError(reply, error); }
  });

  app.post('/api/cook', async () => {
    const items = db.prepare('SELECT name FROM inventory WHERE quantity > 0 ORDER BY updated_at DESC LIMIT 5').all();
    const names = items.map((item) => item.name);
    return { suggestion: names.length ? `Sugestão simples com ${names.join(', ')}: refogue os ingredientes, ajuste o sal e finalize com o que tiver fresco.` : 'Adicione alguns itens ao estoque para receber uma sugestão.' };
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