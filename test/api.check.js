import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApp } from '../server/index.js';

let app;
let dataDir;

test.before(async () => {
  process.env.NODE_ENV = 'test';
  dataDir = mkdtempSync(path.join(tmpdir(), 'sous-lite-test-'));
  app = await buildApp({ dataDir, logger: false });
});

test.after(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const request = (method, url, payload) => app.inject({ method, url, payload });

test('GET /healthz responde 200 ok', async () => {
  const response = await request('GET', '/healthz');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, 'ok');
});

test('POST /api/inventory cria item com unidade canônica e validade estimada', async () => {
  const response = await request('POST', '/api/inventory', { name: 'sorvete de flocos', quantity: 1.5, unit: 'Kg', min_quantity: 1 });
  assert.equal(response.statusCode, 201);
  const item = response.json().item;
  assert.equal(item.name, 'sorvete de flocos');
  assert.equal(item.quantity, 1.5);
  assert.equal(item.unit, 'kg');
  assert.equal(item.storage_location, 'freezer');
  assert.match(item.expires_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(item.low_stock, false);
});

test('POST /api/inventory valida nome, unidade e quantidade', async () => {
  assert.equal((await request('POST', '/api/inventory', { name: '   ' })).statusCode, 422);
  assert.equal((await request('POST', '/api/inventory', { name: 'x', unit: 'caixa' })).statusCode, 422);
  assert.equal((await request('POST', '/api/inventory', { name: 'x', quantity: 'abc' })).statusCode, 422);
  assert.equal((await request('POST', '/api/inventory', { name: 'x', quantity: -2 })).statusCode, 422);
  assert.equal((await request('POST', '/api/inventory', {})).statusCode, 422);
  const error = await request('POST', '/api/inventory', { name: 'x', unit: 'caixa' });
  assert.match(error.json().error, /Unidade inválida/);
});

test('GET /api/inventory lista itens com low_stock', async () => {
  await request('POST', '/api/inventory', { name: 'macarrão', quantity: 1, min_quantity: 3 });
  const response = await request('GET', '/api/inventory');
  assert.equal(response.statusCode, 200);
  const macarrão = response.json().items.find((item) => item.name === 'macarrão');
  assert.equal(macarrão.low_stock, true);
});

test('PATCH /api/inventory atualiza campos e valida entrada', async () => {
  const created = (await request('POST', '/api/inventory', { name: 'feijão', quantity: 2, unit: 'kg' })).json().item;
  const ok = await request('PATCH', `/api/inventory/${created.id}`, { name: 'feijão carioca', quantity: 1, unit: 'g' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().item.name, 'feijão carioca');
  assert.equal(ok.json().item.quantity, 1);
  assert.equal(ok.json().item.unit, 'g');

  assert.equal((await request('PATCH', `/api/inventory/${created.id}`, { name: '' })).statusCode, 422);
  assert.equal((await request('PATCH', `/api/inventory/${created.id}`, { unit: 'lata' })).statusCode, 422);
  assert.equal((await request('PATCH', `/api/inventory/${created.id}`, { quantity: 'nada' })).statusCode, 422);
  assert.equal((await request('PATCH', `/api/inventory/${created.id}`, { expires_on: '31/12/2025' })).statusCode, 422);
  assert.equal((await request('PATCH', `/api/inventory/${created.id}`, {})).statusCode, 200);
});

test('PATCH/DELETE /api/inventory com id inexistente retorna 404', async () => {
  assert.equal((await request('PATCH', '/api/inventory/99999', { name: 'x' })).statusCode, 404);
  assert.equal((await request('DELETE', '/api/inventory/99999')).statusCode, 404);
});

test('DELETE /api/inventory remove o item', async () => {
  const created = (await request('POST', '/api/inventory', { name: 'temporário' })).json().item;
  assert.deepEqual((await request('DELETE', `/api/inventory/${created.id}`)).json(), { ok: true });
  assert.equal((await request('DELETE', `/api/inventory/${created.id}`)).statusCode, 404);
});

test('fluxo completo da lista de compras', async () => {
  const created = (await request('POST', '/api/shopping', { name: 'café', quantity: 2, unit: 'un' })).json().item;
  assert.equal(created.checked, false);
  const toggled = await request('PATCH', `/api/shopping/${created.id}`, { checked: true });
  assert.equal(toggled.json().item.checked, true);
  assert.equal((await request('PATCH', `/api/shopping/${created.id}`, { name: '' })).statusCode, 422);
  assert.equal((await request('PATCH', `/api/shopping/${created.id}`, { unit: 'zzz' })).statusCode, 422);
  const deleted = await request('DELETE', `/api/shopping/${created.id}`);
  assert.equal(deleted.statusCode, 200);
  assert.equal((await request('GET', '/api/shopping')).json().items.length, 0);
});

test('POST /api/commands cria itens no estoque e na lista', async () => {
  const inventory = await request('POST', '/api/commands', { text: 'comprei 2 kg de arroz' });
  assert.equal(inventory.statusCode, 200);
  assert.equal(inventory.json().action, 'inventory.add');
  assert.equal(inventory.json().item.unit, 'kg');

  const shopping = await request('POST', '/api/commands', { text: 'vou comprar 1 leite' });
  assert.equal(shopping.statusCode, 200);
  assert.equal(shopping.json().action, 'shopping.add');

  const batch = await request('POST', '/api/commands', { text: 'comprei 3 ovos e leite' });
  assert.equal(batch.statusCode, 200);
  assert.equal(batch.json().action, 'batch');
  assert.equal(batch.json().items.length, 2);
  assert.deepEqual(batch.json().items.map((item) => item.name), ['ovos', 'leite']);

  const stock = (await request('GET', '/api/inventory')).json().items;
  assert.equal(stock.find((item) => item.name === 'arroz').quantity, 2);
  const list = (await request('GET', '/api/shopping')).json().items;
  assert.equal(list.find((item) => item.name === 'leite').quantity, 1);
});

test('POST /api/commands normaliza unidades por extenso', async () => {
  await request('POST', '/api/commands', { text: 'comprei 5 litros de leite condensado' });
  const item = (await request('GET', '/api/inventory')).json().items.find((entry) => entry.name === 'leite condensado');
  assert.equal(item.unit, 'l');
});

test('POST /api/commands rejeita texto não reconhecido com 422', async () => {
  const response = await request('POST', '/api/commands', { text: 'olá sous' });
  assert.equal(response.statusCode, 422);
  assert.match(response.json().error, /Não entendi/);
});