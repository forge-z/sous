import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { openDatabase } from './db.js';
import {
  addInventory,
  addShopping,
  applyCommands,
  checkoutShopping,
  cookSuggestion,
  exportBackup,
  idOf,
  importBackup,
  listInventory,
  listShopping,
  removeInventory,
  removeShopping,
  restoreInventory,
  restoreShopping,
  updateInventory,
  updateShopping,
} from './kitchen.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const quantitySchema = { anyOf: [{ type: 'number' }, { type: 'string', maxLength: 40 }] };
const itemBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 200 },
    quantity: quantitySchema,
    unit: { type: 'string', maxLength: 40 },
    min_quantity: quantitySchema,
    storage_location: { type: 'string', maxLength: 40 },
    expires_on: { type: ['string', 'null'], maxLength: 40 },
    auto_expiry: { anyOf: [{ type: 'boolean' }, { type: 'string', maxLength: 8 }] },
    expiry_estimated: { anyOf: [{ type: 'integer' }, { type: 'boolean' }, { type: 'number' }] },
    checked: { anyOf: [{ type: 'boolean' }, { type: 'integer' }, { type: 'number' }] },
    created_at: { type: 'string', maxLength: 40 },
    updated_at: { type: 'string', maxLength: 40 },
    id: { type: ['integer', 'number'] },
    low_stock: { type: 'boolean' },
    weekly_usage: { type: 'number' },
    restock_quantity: { type: 'number' },
  },
};
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { anyOf: [{ type: 'integer' }, { type: 'string', pattern: '^[0-9]+$' }] } },
};
const backupBody = {
  type: 'object',
  additionalProperties: true,
  properties: {
    version: { type: 'integer' },
    exported_at: { type: 'string' },
    inventory: { type: 'array', items: itemBody },
    shopping: { type: 'array', items: itemBody },
    movements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          name: { type: 'string' },
          delta: quantitySchema,
          unit: { type: 'string' },
          created_at: { type: 'string' },
        },
      },
    },
  },
};

function isSqliteConstraint(error) {
  return error?.code === 'ERR_SQLITE_CONSTRAINT'
    || /SQLITE_CONSTRAINT|CHECK constraint|NOT NULL constraint/i.test(String(error?.message || ''));
}

export async function buildApp(options = {}) {
  const { dataDir, logger = process.env.NODE_ENV !== 'test' } = options;
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: true } } });
  const db = openDatabase(dataDir);
  app.addHook('onClose', () => { try { db.close(); } catch { /* já fechado */ } });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'Pedido inválido. Verifique os campos enviados.' });
    }
    if (isSqliteConstraint(error)) {
      return reply.code(400).send({ error: 'Não foi possível gravar. Verifique quantidade, unidade e local.' });
    }
    const status = error.statusCode || 500;
    const message = status >= 500 ? 'Erro interno.' : error.message;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({ error: message });
  });

  app.get('/healthz', async () => ({ status: 'ok', service: 'sous-lite' }));

  app.get('/api/inventory', async () => ({ items: listInventory(db) }));
  app.post('/api/inventory', { schema: { body: itemBody } }, async (request, reply) => {
    const { item, merged } = addInventory(db, request.body || {});
    return reply.code(merged ? 200 : 201).send({ item, merged });
  });
  app.post('/api/inventory/restore', { schema: { body: itemBody } }, async (request, reply) => {
    return reply.code(201).send({ item: restoreInventory(db, request.body || {}) });
  });
  app.patch('/api/inventory/:id', { schema: { params: idParams, body: itemBody } }, async (request, reply) => {
    const item = updateInventory(db, idOf(request.params.id), request.body || {});
    if (!item) return reply.code(404).send({ error: 'Item não encontrado.' });
    return { item };
  });
  app.delete('/api/inventory/:id', { schema: { params: idParams } }, async (request, reply) => {
    const item = removeInventory(db, idOf(request.params.id));
    if (!item) return reply.code(404).send({ error: 'Item não encontrado.' });
    return { ok: true, item };
  });

  app.get('/api/shopping', async () => ({ items: listShopping(db) }));
  app.post('/api/shopping', { schema: { body: itemBody } }, async (request, reply) => {
    const { item, merged } = addShopping(db, request.body || {});
    return reply.code(merged ? 200 : 201).send({ item, merged });
  });
  app.post('/api/shopping/restore', { schema: { body: itemBody } }, async (request, reply) => {
    return reply.code(201).send({ item: restoreShopping(db, request.body || {}) });
  });
  app.patch('/api/shopping/:id', { schema: { params: idParams, body: itemBody } }, async (request, reply) => {
    const item = updateShopping(db, idOf(request.params.id), request.body || {});
    if (!item) return reply.code(404).send({ error: 'Item não encontrado.' });
    return { item };
  });
  app.delete('/api/shopping/:id', { schema: { params: idParams } }, async (request, reply) => {
    const item = removeShopping(db, idOf(request.params.id));
    if (!item) return reply.code(404).send({ error: 'Item não encontrado.' });
    return { ok: true, item };
  });
  app.post('/api/shopping/checkout', async () => {
    const items = checkoutShopping(db);
    return { moved: items.length, items };
  });

  app.post('/api/commands', { schema: { body: { type: 'object', properties: { text: { type: 'string', maxLength: 2000 } } } } }, async (request) => {
    return applyCommands(db, request.body?.text);
  });
  app.post('/api/cook', async () => cookSuggestion(db));

  app.get('/api/backup', async () => exportBackup(db));
  app.post('/api/backup', { schema: { body: backupBody } }, async (request) => importBackup(db, request.body || {}));

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
