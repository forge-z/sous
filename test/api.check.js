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

  const dozen = await request('POST', '/api/commands', { text: 'comprei dúzia de bananas' });
  assert.equal(dozen.statusCode, 200);
  assert.equal(dozen.json().item.quantity, 12);
  assert.equal(dozen.json().item.unit, 'un');
});

test('POST /api/commands rejeita texto não reconhecido com 422', async () => {
  const response = await request('POST', '/api/commands', { text: 'olá sous' });
  assert.equal(response.statusCode, 422);
  assert.match(response.json().error, /Não entendi/);
});

test('itens repetidos somam quantidade em vez de duplicar a linha', async () => {
  const created = await request('POST', '/api/inventory', { name: 'lentilha', quantity: 2, unit: 'kg' });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().merged, false);

  const merged = await request('POST', '/api/inventory', { name: 'Lentilha', quantity: 500, unit: 'g' });
  assert.equal(merged.statusCode, 200);
  assert.equal(merged.json().merged, true);
  assert.equal(merged.json().item.id, created.json().item.id);
  assert.equal(merged.json().item.quantity, 2.5);
  assert.equal(merged.json().item.unit, 'kg');
  assert.equal(merged.json().item.name, 'lentilha');

  const rows = (await request('GET', '/api/inventory')).json().items.filter((item) => /lentilha/i.test(item.name));
  assert.equal(rows.length, 1);
});

test('repor um item pelo formulário não apaga a validade guardada', async () => {
  const created = (await request('POST', '/api/inventory', { name: 'manteiga', quantity: 1 })).json().item;
  assert.equal(created.expiry_estimated, 1);

  // O formulário envia os campos vazios que o usuário não preencheu.
  const merged = (await request('POST', '/api/inventory', { name: 'manteiga', quantity: 2, unit: 'un', storage_location: '', expires_on: '', auto_expiry: true })).json().item;
  assert.equal(merged.quantity, 3);
  assert.equal(merged.expires_on, created.expires_on);
  assert.equal(merged.expiry_estimated, 1);
  assert.equal(merged.storage_location, created.storage_location);
});

test('unidades de grandezas diferentes continuam em linhas separadas', async () => {
  await request('POST', '/api/inventory', { name: 'cebola', quantity: 3, unit: 'un' });
  const other = await request('POST', '/api/inventory', { name: 'cebola', quantity: 1, unit: 'kg' });
  assert.equal(other.statusCode, 201);
  assert.equal((await request('GET', '/api/inventory')).json().items.filter((item) => item.name === 'cebola').length, 2);
});

test('a lista de compras soma pendentes e mantém comprados separados', async () => {
  const created = (await request('POST', '/api/shopping', { name: 'azeite', quantity: 1 })).json().item;
  const merged = await request('POST', '/api/shopping', { name: 'Azeite', quantity: 2 });
  assert.equal(merged.json().item.id, created.id);
  assert.equal(merged.json().item.quantity, 3);

  await request('PATCH', `/api/shopping/${created.id}`, { checked: true });
  const again = await request('POST', '/api/shopping', { name: 'azeite', quantity: 1 });
  assert.equal(again.statusCode, 201);
  assert.notEqual(again.json().item.id, created.id);

  for (const item of (await request('GET', '/api/shopping')).json().items) {
    await request('DELETE', `/api/shopping/${item.id}`);
  }
});

test('POST /api/shopping/checkout move os comprados para o estoque', async () => {
  assert.equal((await request('POST', '/api/shopping/checkout')).statusCode, 422);

  const bought = (await request('POST', '/api/shopping', { name: 'grão de bico', quantity: 2, unit: 'kg' })).json().item;
  const pending = (await request('POST', '/api/shopping', { name: 'guardanapo' })).json().item;
  await request('PATCH', `/api/shopping/${bought.id}`, { checked: true });

  const checkout = await request('POST', '/api/shopping/checkout');
  assert.equal(checkout.statusCode, 200);
  assert.equal(checkout.json().moved, 1);
  assert.equal(checkout.json().items[0].name, 'grão de bico');

  const list = (await request('GET', '/api/shopping')).json().items;
  assert.deepEqual(list.map((item) => item.id), [pending.id]);
  const stocked = (await request('GET', '/api/inventory')).json().items.find((item) => item.name === 'grão de bico');
  assert.equal(stocked.quantity, 2);
  assert.equal(stocked.unit, 'kg');

  await request('DELETE', `/api/shopping/${pending.id}`);
});

test('atualizar a quantidade não renova a validade estimada', async () => {
  const created = (await request('POST', '/api/inventory', { name: 'iogurte natural', quantity: 1 })).json().item;
  assert.equal(created.expiry_estimated, 1);

  await request('PATCH', `/api/inventory/${created.id}`, { expires_on: '2020-01-05' });
  const explicit = (await request('PATCH', `/api/inventory/${created.id}`, { quantity: 4 })).json().item;
  assert.equal(explicit.expires_on, '2020-01-05');
  assert.equal(explicit.expiry_estimated, 0);

  const renamed = (await request('PATCH', `/api/inventory/${created.id}`, { name: 'iogurte grego' })).json().item;
  assert.equal(renamed.expires_on, '2020-01-05');

  // Reenviar a mesma data preserva o rótulo de estimativa do item.
  const auto = (await request('POST', '/api/inventory', { name: 'requeijão', quantity: 1 })).json().item;
  const resent = (await request('PATCH', `/api/inventory/${auto.id}`, { name: 'requeijão light', expires_on: auto.expires_on })).json().item;
  assert.equal(resent.expiry_estimated, 1);
  assert.equal(resent.expires_on, auto.expires_on);
});

test('PATCH com expires_on vazio limpa a validade', async () => {
  const created = (await request('POST', '/api/inventory', { name: 'fermento', quantity: 1 })).json().item;
  await request('PATCH', `/api/inventory/${created.id}`, { expires_on: '2030-01-05' });
  const cleared = (await request('PATCH', `/api/inventory/${created.id}`, { expires_on: '' })).json().item;
  assert.equal(cleared.expires_on, null);
  assert.equal(cleared.expiry_estimated, 0);
});

test('POST /api/inventory respeita auto_expiry desligado', async () => {
  const item = (await request('POST', '/api/inventory', { name: 'peito de frango', quantity: 1, auto_expiry: false })).json().item;
  assert.equal(item.expires_on, null);
  assert.equal(item.storage_location, 'geladeira');
});

test('POST /api/cook prioriza o que está perto do vencimento', async () => {
  for (const item of (await request('GET', '/api/inventory')).json().items) {
    await request('DELETE', `/api/inventory/${item.id}`);
  }

  await request('POST', '/api/inventory', { name: 'farinha', quantity: 1, auto_expiry: false });
  const relaxed = await request('POST', '/api/cook');
  assert.deepEqual(relaxed.json().priority, []);
  assert.match(relaxed.json().suggestion, /farinha/);

  const soon = new Date();
  soon.setDate(soon.getDate() + 1);
  await request('POST', '/api/inventory', { name: 'espinafre', quantity: 1, expires_on: soon.toISOString().slice(0, 10) });
  const urgent = await request('POST', '/api/cook');
  assert.deepEqual(urgent.json().priority, ['espinafre']);
  assert.match(urgent.json().suggestion, /Comece por espinafre/);
});

test('POST /api/cook orienta o usuário quando o estoque está vazio', async () => {
  for (const item of (await request('GET', '/api/inventory')).json().items) {
    await request('DELETE', `/api/inventory/${item.id}`);
  }
  const response = await request('POST', '/api/cook');
  assert.match(response.json().suggestion, /Adicione alguns itens/);
});
