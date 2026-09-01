const NUMBER = '(\\d+(?:[.,]\\d+)?)';

const UNIT_ALIASES = new Map([
  ['kg', 'kg'], ['quilo', 'kg'], ['quilos', 'kg'],
  ['g', 'g'], ['grama', 'g'], ['gramas', 'g'],
  ['l', 'l'], ['litro', 'l'], ['litros', 'l'],
  ['ml', 'ml'], ['mililitro', 'ml'], ['mililitros', 'ml'],
  ['un', 'un'], ['unidade', 'un'], ['unidades', 'un'], ['unid', 'un'], ['unids', 'un'],
]);

const DOZEN_MULTIPLIERS = new Map([
  ['meia', 0.5],
  ['um', 1], ['uma', 1],
  ['dois', 2], ['duas', 2],
  ['tres', 3], ['três', 3],
  ['quatro', 4], ['cinco', 5], ['seis', 6], ['sete', 7], ['oito', 8], ['nove', 9], ['dez', 10],
]);

export function canonicalUnit(value) {
  return UNIT_ALIASES.get(String(value || '').trim().toLowerCase()) ?? null;
}

export function normalizeUnit(unit) {
  return canonicalUnit(unit) ?? 'un';
}

// Lista de compras primeiro: formas "adicionar X à/na lista" jamais devem cair no estoque.
const SHOPPING_RE = /^(?:comprar|vou comprar|quero comprar|preciso comprar|preciso de|comprando|est(?:ou|á|a) comprando|falta(?:ndo)?|faltou|est(?:á|a) faltando|adicion(?:a|ar|e) (?:à|na) lista)\s+(.+)$/i;
const INVENTORY_RE = /^(?:comprei|compro|adicion(?:a|ar|e)|adicionei|add|ganhei|tenho|trouxe)\s+(.+)$/i;

function commandPrefix(text) {
  const shopping = text.match(SHOPPING_RE);
  if (shopping) return { type: 'shopping.add', body: shopping[1] };
  const inventory = text.match(INVENTORY_RE);
  if (inventory) return { type: 'inventory.add', body: inventory[1] };
  return null;
}

function splitItems(body) {
  return body
    // Vírgula entre dígitos (1,5) é decimal; vírgula/ponto-e-vírgula real separa itens.
    .split(/\s*[,;](?!\d)\s*/)
    .flatMap((group) => group.trim().split(/\s+e\s+/i))
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function parseDozen(chunk) {
  const numeric = chunk.match(new RegExp('^' + NUMBER + '\\s*d(?:ú|u)zia(?:s)?\\s*(?:de\\s+)?(.+)$', 'i'));
  if (numeric) {
    return { name: numeric[2].trim(), quantity: Number(numeric[1].replace(',', '.')) * 12, unit: 'un' };
  }

  const written = chunk.match(/^(meia|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez)?\s*d(?:ú|u)zia(?:s)?\s*(?:de\s+)?(.+)$/i);
  if (!written) return null;

  const multiplier = written[1]
    ? DOZEN_MULTIPLIERS.get(written[1].toLocaleLowerCase('pt-BR')) ?? 1
    : 1;
  return { name: written[2].trim(), quantity: multiplier * 12, unit: 'un' };
}

function parseItem(chunk) {
  const dozen = parseDozen(chunk);
  if (dozen) return dozen;
  const match = chunk.match(new RegExp(`^${NUMBER}\\s*(kg|quilo(?:s)?|g|grama(?:s)?|l|litro(?:s)?|ml|mililitro(?:s)?|un(?:idades?)?|unid(?:ade)?s?)?(?=\\s|$)\\s*(?:de\\s+)?(.+)$`, 'i'));
  if (!match) return { name: chunk, quantity: 1, unit: 'un' };
  return { name: match[3].trim(), quantity: Number(match[1].replace(',', '.')), unit: canonicalUnit(match[2]) ?? 'un' };
}

export function parseCommands(input) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const command = commandPrefix(text);
  if (!command) return null;
  return splitItems(command.body).map((item) => ({ type: command.type, ...parseItem(item) }));
}

export function parseCommand(input) {
  return parseCommands(input)?.[0] || null;
}
