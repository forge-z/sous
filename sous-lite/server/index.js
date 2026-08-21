import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { openDatabase } from './db.js';
import { parseCommand } from './parser.js';

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

function inventoryView(row) {
  return { ...row, low_stock: Number(row.quantity) <= Number(row.min_quantity) };
}

function shoppingView(row) {
  return { ...row, checked: Boolean(row.checked) };
}

function addInventory(body) {
  const name = cleanName(body?.name);
  if (!name) throw Object.assign(new Error('Informe o nome do item.'), { statusCode: 422 });
  const timestamp = now();
  const result = db.prepare(`INSERT INTO inventory (name, quantity, unit, min_quantity, expires_on, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(name, number(body.quantity, 1), cleanName(body.unit) || 'un', number(body.min_quantity), body.expires_on || null, timestamp, timestamp);
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
  const updated = {
    name: body.name === undefined ? existing.name : cleanName(body.name),
    quantity: body.quantity === undefined ? existing.quantity : number(body.quantity),
    unit: body.unit === undefined ? existing.unit : cleanName(body.unit) || 'un',
    min_quantity: body.min_quantity === undefined ? existing.min_quantity : number(body.min_quantity),
    expires_on: body.expires_on === undefined ? existing.expires_on : body.expires_on || null,
  };
  db.prepare('UPDATE inventory SET name = ?, quantity = ?, unit = ?, min_quantity = ?, expires_on = ?, updated_at = ? WHERE id = ?')
    .run(updated.name, updated.quantity, updated.unit, updated.min_quantity, updated.expires_on, now(), id);
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
  const action = parseCommand(request.body?.text);
  if (!action) return reply.code(422).send({ error: 'Não entendi. Use: “comprei 2 kg de arroz” ou “comprar 1 leite”.' });
  const item = action.type === 'inventory.add' ? addInventory(action) : addShopping(action);
  return { action: action.type, item };
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
