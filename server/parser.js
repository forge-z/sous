const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const UNIT = '(kg|quilo(?:s)?|g|grama(?:s)?|l|litro(?:s)?|ml|mililitro(?:s)?|un(?:idades?)?|unid(?:ade)?s?)?';

function normalizeUnit(unit) {
  const value = String(unit || 'un').toLowerCase();
  if (value.startsWith('kg') || value.startsWith('quilo')) return 'kg';
  if (value === 'g' || value.startsWith('grama')) return 'g';
  if (value.startsWith('ml') || value.startsWith('mililitro')) return 'ml';
  if (value.startsWith('l') || value.startsWith('litro')) return 'l';
  return 'un';
}

function commandPrefix(text) {
  const inventory = text.match(/^(?:comprei|adicionar?|adicionei|add)\s+(.+)$/i);
  if (inventory) return { type: 'inventory.add', body: inventory[1] };
  const shopping = text.match(/^(?:comprar|preciso de|adicione à lista)\s+(.+)$/i);
  if (shopping) return { type: 'shopping.add', body: shopping[1] };
  return null;
}

function splitItems(body) {
  const chunks = body
    .split(/\s*(?:,|;)\s*|\s+e\s+(?=\d)/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length === 1 && !new RegExp(`^${NUMBER}\\s*${UNIT}`, 'i').test(body) && /\s+e\s+/i.test(body)) {
    return body.split(/\s+e\s+/i).map((chunk) => chunk.trim()).filter(Boolean);
  }
  return chunks;
}

function parseItem(chunk) {
  const match = chunk.match(new RegExp(`^${NUMBER}\\s*(kg|quilo(?:s)?|g|grama(?:s)?|l|litro(?:s)?|ml|mililitro(?:s)?|un(?:idades?)?|unid(?:ade)?s?)?(?=\\s|$)\\s*(?:de\\s+)?(.+)$`, 'i'));
  if (!match) return { name: chunk, quantity: 1, unit: 'un' };
  return { name: match[3].trim(), quantity: Number(match[1].replace(',', '.')), unit: normalizeUnit(match[2]) };
}

export function parseCommands(input) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const command = commandPrefix(text);
  if (!command) return null;
  return splitItems(command.body).map((chunk) => ({ type: command.type, ...parseItem(chunk) }));
}

export function parseCommand(input) {
  return parseCommands(input)?.[0] || null;
}
