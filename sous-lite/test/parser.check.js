import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../server/parser.js';

test('interpreta comando de entrada no estoque', () => {
  assert.deepEqual(parseCommand('Comprei 2 kg de arroz'), { type: 'inventory.add', name: 'arroz', quantity: 2, unit: 'kg' });
});

test('interpreta comando de lista de compras', () => {
  assert.deepEqual(parseCommand('comprar 1 leite'), { type: 'shopping.add', name: 'leite', quantity: 1, unit: 'un' });
});

test('retorna nulo para texto não reconhecido', () => {
  assert.equal(parseCommand('olá sous'), null);
});
