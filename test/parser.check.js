import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseCommands, canonicalUnit, normalizeUnit } from '../server/parser.js';

test('interpreta comando de entrada no estoque', () => {
  assert.deepEqual(parseCommand('Comprei 2 kg de arroz'), { type: 'inventory.add', name: 'arroz', quantity: 2, unit: 'kg' });
});

test('normaliza espaços extras no comando', () => {
  assert.deepEqual(parseCommand('comprei   1   kg   de arroz'), { type: 'inventory.add', name: 'arroz', quantity: 1, unit: 'kg' });
});

test('interpreta comando de lista de compras', () => {
  assert.deepEqual(parseCommand('comprar 1 leite'), { type: 'shopping.add', name: 'leite', quantity: 1, unit: 'un' });
});

test('separa vários itens no mesmo comando', () => {
  assert.deepEqual(parseCommands('comprei frango, 6 litros de leite e 1kg de macarrão'), [
    { type: 'inventory.add', name: 'frango', quantity: 1, unit: 'un' },
    { type: 'inventory.add', name: 'leite', quantity: 6, unit: 'l' },
    { type: 'inventory.add', name: 'macarrão', quantity: 1, unit: 'kg' },
  ]);
});

test('retorna nulo para texto não reconhecido', () => {
  assert.equal(parseCommand('olá sous'), null);
});

test('aceita vírgula decimal sem confundir com separador de itens', () => {
  assert.deepEqual(parseCommands('comprei 1,5 kg de frango, 2 pães'), [
    { type: 'inventory.add', name: 'frango', quantity: 1.5, unit: 'kg' },
    { type: 'inventory.add', name: 'pães', quantity: 2, unit: 'un' },
  ]);
});

test('normaliza unidades com maiúsculas e por extenso', () => {
  assert.deepEqual(parseCommand('comprei 2 KG de feijão'), { type: 'inventory.add', name: 'feijão', quantity: 2, unit: 'kg' });
  assert.deepEqual(parseCommand('comprei 5 Litros de leite'), { type: 'inventory.add', name: 'leite', quantity: 5, unit: 'l' });
  assert.deepEqual(parseCommand('comprei 2 unidades de sabão'), { type: 'inventory.add', name: 'sabão', quantity: 2, unit: 'un' });
});

test('converte dúzias em unidades de produto', () => {
  assert.deepEqual(parseCommand('comprei dúzia de ovos'), { type: 'inventory.add', name: 'ovos', quantity: 12, unit: 'un' });
  assert.deepEqual(parseCommand('comprei meia dúzia de ovos'), { type: 'inventory.add', name: 'ovos', quantity: 6, unit: 'un' });
  assert.deepEqual(parseCommand('comprei duas dúzias de ovos'), { type: 'inventory.add', name: 'ovos', quantity: 24, unit: 'un' });
  assert.deepEqual(parseCommand('comprar 1 duzia de ovos'), { type: 'shopping.add', name: 'ovos', quantity: 12, unit: 'un' });
});

test('aceita variantes naturais em PT-BR para o estoque', () => {
  assert.deepEqual(parseCommand('tenho 3 pães'), { type: 'inventory.add', name: 'pães', quantity: 3, unit: 'un' });
  assert.deepEqual(parseCommand('ganhei 1 bolo'), { type: 'inventory.add', name: 'bolo', quantity: 1, unit: 'un' });
  assert.deepEqual(parseCommand('adiciona batata'), { type: 'inventory.add', name: 'batata', quantity: 1, unit: 'un' });
  assert.deepEqual(parseCommand('adicionei 5 maçãs'), { type: 'inventory.add', name: 'maçãs', quantity: 5, unit: 'un' });
  assert.deepEqual(parseCommand('trouxe 2 kg de carne'), { type: 'inventory.add', name: 'carne', quantity: 2, unit: 'kg' });
});

test('aceita variantes naturais em PT-BR para a lista de compras', () => {
  assert.deepEqual(parseCommand('vou comprar 2 detergentes'), { type: 'shopping.add', name: 'detergentes', quantity: 2, unit: 'un' });
  assert.deepEqual(parseCommand('preciso comprar sal'), { type: 'shopping.add', name: 'sal', quantity: 1, unit: 'un' });
  assert.deepEqual(parseCommand('preciso de 2 kg de açúcar'), { type: 'shopping.add', name: 'açúcar', quantity: 2, unit: 'kg' });
  assert.deepEqual(parseCommand('falta café'), { type: 'shopping.add', name: 'café', quantity: 1, unit: 'un' });
  assert.deepEqual(parseCommand('faltou papel'), { type: 'shopping.add', name: 'papel', quantity: 1, unit: 'un' });
  assert.deepEqual(parseCommand('está faltando arroz'), { type: 'shopping.add', name: 'arroz', quantity: 1, unit: 'un' });
  assert.deepEqual(parseCommand('estou comprando refrigerante'), { type: 'shopping.add', name: 'refrigerante', quantity: 1, unit: 'un' });
});

test('não confunde “adicionar à lista” com entrada no estoque', () => {
  assert.deepEqual(parseCommand('adicione à lista 6 cervejas'), { type: 'shopping.add', name: 'cervejas', quantity: 6, unit: 'un' });
  assert.deepEqual(parseCommand('adicionar na lista pão'), { type: 'shopping.add', name: 'pão', quantity: 1, unit: 'un' });
  assert.deepEqual(parseCommand('adicione batata'), { type: 'inventory.add', name: 'batata', quantity: 1, unit: 'un' });
});

test('separa itens unidos por “e” mesmo sem número após o conectivo', () => {
  assert.deepEqual(parseCommands('comprei 3 ovos e leite'), [
    { type: 'inventory.add', name: 'ovos', quantity: 3, unit: 'un' },
    { type: 'inventory.add', name: 'leite', quantity: 1, unit: 'un' },
  ]);
});

test('retorna nulo para verbos sem conteúdo', () => {
  assert.equal(parseCommand('preciso de'), null);
  assert.equal(parseCommand('comprar'), null);
});

test('canonicalUnit resolve somente o conjunto canônico', () => {
  assert.equal(canonicalUnit('Kg'), 'kg');
  assert.equal(canonicalUnit('LITROS'), 'l');
  assert.equal(canonicalUnit('unidade'), 'un');
  assert.equal(canonicalUnit('caixa'), null);
  assert.equal(normalizeUnit('caixa'), 'un');
  assert.equal(normalizeUnit(undefined), 'un');
});
