const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const UNIT = '(kg|g|l|ml|un(?:idades?)?|unid(?:ade)?s?)?';

function normalizeUnit(unit) {
  const value = String(unit || 'un').toLowerCase();
  if (value.startsWith('kg')) return 'kg';
  if (value === 'g') return 'g';
  if (value.startsWith('l')) return 'l';
  if (value === 'ml') return 'ml';
  return 'un';
}

export function parseCommand(input) {
  const text = String(input || '').trim().replace(/\\s+/g, ' ');
  if (!text) return null;

  const add = text.match(new RegExp(`^(?:comprei|adicionar?|adicionei|add)\\s+${NUMBER}\\s*${UNIT}\\s+(?:de\\s+)?(.+)$`, 'i'));
  if (add) {
    return { type: 'inventory.add', name: add[3].trim(), quantity: Number(add[1].replace(',', '.')), unit: normalizeUnit(add[2]) };
  }

  const buy = text.match(new RegExp(`^(?:comprar|preciso de|adicione à lista)\\s+${NUMBER}\\s*${UNIT}\\s+(?:de\\s+)?(.+)$`, 'i'));
  if (buy) {
    return { type: 'shopping.add', name: buy[3].trim(), quantity: Number(buy[1].replace(',', '.')), unit: normalizeUnit(buy[2]) };
  }

  return null;
}
