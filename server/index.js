import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { openDatabase } from './db.js';
import { parseCommands } from './parser.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
const dataDir = process.env.DATA_DIR || path.join(root, '..', 'data');
const db = openDatabase(dataDir);
const now = () => new Date().toISOString();
const cleanName = (value) => String(value || '').trim().replace(/\\s+/g, ' ').slice(0, 120);
const number = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const idOf = (value) => Number.isInteger(Number(value)) ? Number(value) : 0;
const STORAGE_LOCATIONS = new Set(['despensa', 'geladeira', 'freezer', 'fruteira', 'bancada', 'outro']);

function normalizeStorage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return STORAGE_LOCATIONS.has(normalized) ? normalized : 'despensa';
}

function inferStorageLocation(name) {
  const value = String(name || '').toLowerCase();
  if (/(?:congelad|sorvete|gelo|polpa)/.test(value)) return 'freezer';
  if (/\b(?:banana|maçã|maca|laranja|limão|limao|abacate|manga|mamão|mamao|pera)\b/.test(value)) return 'fruteira';
  if (/\b(?:leite|queijo|iogurte|manteiga|requeijão|requeijao|creme de leite|ovo|carne|frango|peixe|presunto|linguiça|linguica|tofu)\b/.test(value)) return 'geladeira';
  return 'despensa';
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function estimateExpiry(name, storage) {
  const value = String(name || '').toLowerCase();
  if (storage === 'freezer') return addDays(90);
  if (storage !== 'geladeira') return null;
  if (/\b(?:carne|frango|peixe|presunto|linguiça|linguica)\b/.test(value)) return addDays(3);
  if (/\b(?:leite|queijo|iogurte|manteiga|requeijão|requeijao|creme|ovo)\b/.test(value)) return addDays(7);
  return addDays(5);
}

function inventoryMeta(body, existing = null) {
  const name = cleanName(body?.name ?? existing?.name);
  const storage = body?.storage_location === undefined
    ? (existing?.storage_location || inferStorageLocation(name))
    : normalizeStorage(body.storage_location);
  const explicitExpiry = body?.expires_on || (existing?.expiry_estimated ? null : existing?.expires_on) || null;
  const shouldEstimate = body?.auto_expiry !== false;
  const expiresOn = explicitExpiry || (shouldEstimate ? estimateExpiry(name, storage) : null);
  return { storage_location: storage, expires_on: expiresOn, expiry_estimated: explicitExpiry ? 0 : expiresOn ? 1 : 0 };
}

function inventoryView(row) {
  return { ...row, low_stock: Number(row.quantity) <= Number(row.min_quantity) };
}

function shoppingView(row) {
  return { ...row, checked: Boolean(row.checked) };
}

function addInventory(body) {
  const name = cleanName(body?.name);
  if (!name) throw Object.assign(new Error('Informe o nome do item.'), { statusCode: 422 });
  const meta = inventoryMeta({ ...body, name });
  const timestamp = now();
  const result = db.prepare(`INSERT INTO inventory (name, quantity, unit, min_quantity, storage_location, expires_on, expiry_estimated, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(name, number(body.quantity, 1), cleanName(body.unit) || 'un', number(body.min_quantity), meta.storage_location, meta.expires_on, meta.expiry_estimated, timestamp, timestamp);
  return inventoryView(db.prepare('SELECT * FROM inventory WHERE id = ?').get(Number(result.lastInsertRowid)));
}

function addShopping(body) {
  const name = cleanName(body?.name);
  if (!name) throw Object.assign(new Error('Informe o item da lista.'), { statusCode: 422 });
  const timestamp = now();
  const result = db.prepare(`INSERT INTO shopping (name, quantity, unit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run(name, number(body.quantity, 1), cleanName(body.unit) || 'un', timestamp, timestamp);
  return shoppingView(db.prepare('SELECT * FROM shopping WHERE id = ?').get(Number(result.lastInsertRowid)));
}

app.get('/healthz', async () => ({ status: 'ok', service: 'sous-lite' }));

app.get('/api/inventory', async () => ({ items: db.prepare('SELECT * FROM inventory ORDER BY (quantity <= min_quantity) DESC, name COLLATE NOCASE').all().map(inventoryView) }));
app.post('/api/inventory', async (request, reply) => {
  try { return reply.code(201).send({ item: addInventory(request.body) }); }
  catch (error) { return reply.code(error.statusCode || 400).send({ error: error.message }); }
});
app.patch('/api/inventory/:id', async (request, reply) => {
  const id = idOf(request.params.id);
  const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  if (!existing) return reply.code(404).send({ error: 'Item não encontrado.' });
  const body = request.body || {};
  const meta = inventoryMeta(body, existing);
  const updated = {
    name: body.name === undefined ? existing.name : cleanName(body.name),
    quantity: body.quantity === undefined ? existing.quantity : number(body.quantity),
    unit: body.unit === undefined ? existing.unit : cleanName(body.unit) || 'un',
    min_quantity: body.min_quantity === undefined ? existing.min_quantity : number(body.min_quantity),
    storage_location: meta.storage_location,
    expires_on: meta.expires_on,
    expiry_estimated: meta.expiry_estimated,
  };
  db.prepare('UPDATE inventory SET name = ?, quantity = ?, unit = ?, min_quantity = ?, storage_location = ?, expires_on = ?, expiry_estimated = ?, updated_at = ? WHERE id = ?')
    .run(updated.name, updated.quantity, updated.unit, updated.min_quantity, updated.storage_location, updated.expires_on, updated.expiry_estimated, now(), id);
  return { item: inventoryView(db.prepare('SELECT * FROM inventory WHERE id = ?').get(id)) };
});
app.delete('/api/inventory/:id', async (request, reply) => {
  const result = db.prepare('DELETE FROM inventory WHERE id = ?').run(idOf(request.params.id));
  if (!result.changes) return reply.code(404).send({ error: 'Item não encontrado.' });
  return { ok: true };
});

app.get('/api/shopping', async () => ({ items: db.prepare('SELECT * FROM shopping ORDER BY checked ASC, name COLLATE NOCASE').all().map(shoppingView) }));
app.post('/api/shopping', async (request, reply) => {
  try { return reply.code(201).send({ item: addShopping(request.body) }); }
  catch (error) { return reply.code(error.statusCode || 400).send({ error: error.message }); }
});
app.patch('/api/shopping/:id', async (request, reply) => {
  const id = idOf(request.params.id);
  const existing = db.prepare('SELECT * FROM shopping WHERE id = ?').get(id);
  if (!existing) return reply.code(404).send({ error: 'Item não encontrado.' });
  const body = request.body || {};
  db.prepare('UPDATE shopping SET name = ?, quantity = ?, unit = ?, checked = ?, updated_at = ? WHERE id = ?')
    .run(body.name === undefined ? existing.name : cleanName(body.name), body.quantity === undefined ? existing.quantity : number(body.quantity, 1), body.unit === undefined ? existing.unit : cleanName(body.unit) || 'un', body.checked === undefined ? existing.checked : body.checked ? 1 : 0, now(), id);
  return { item: shoppingView(db.prepare('SELECT * FROM shopping WHERE id = ?').get(id)) };
});
app.delete('/api/shopping/:id', async (request, reply) => {
  const result = db.prepare('DELETE FROM shopping WHERE id = ?').run(idOf(request.params.id));
  if (!result.changes) return reply.code(404).send({ error: 'Item não encontrado.' });
  return { ok: true };
});

app.post('/api/commands', async (request, reply) => {
  const actions = parseCommands(request.body?.text);
  if (!actions?.length) return reply.code(422).send({ error: 'Não entendi. Use: “comprei 2 kg de arroz” ou “comprar 1 leite”.' });
  const items = actions.map((action) => action.type === 'inventory.add' ? addInventory(action) : addShopping(action));
  return { action: actions.length === 1 ? actions[0].type : 'batch', items, item: items[0] };
});

app.post('/api/cook', async () => {
  const items = db.prepare('SELECT name FROM inventory WHERE quantity > 0 ORDER BY updated_at DESC LIMIT 5').all();
  const names = items.map((item) => item.name);
  return { suggestion: names.length ? `Sugestão simples com ${names.join(', ')}: refogue os ingredientes, ajuste o sal e finalize com o que tiver fresco.` : 'Adicione alguns itens ao estoque para receber uma sugestão.' };
});

await app.register(fastifyStatic, { root: path.join(root, '..', 'dist'), prefix: '/' });

const port = Number(process.env.APP_PORT || 3000);
const host = process.env.APP_HOST || '0.0.0.0';
await app.listen({ port, host });

function shutdown() {
  app.close().finally(() => db.close());
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
