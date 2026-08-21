import type { Unit } from "@/lib/domain/inventory";

export type ParsedAction =
  | { action: "add"; item: string; quantity: number | null; unit: Unit }
  | { action: "consume"; item: string; quantity: number | null }
  | { action: "mark_empty"; item: string }
  | { action: "priority"; item: string; priority: "use_soon" | "urgent" };

type AddAction = Extract<ParsedAction, { action: "add" }>;

const words: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const aliases: Record<string, Unit> = { g: "g", kg: "kg", quilo: "kg", quilos: "kg", ml: "ml", l: "l", litro: "l", litros: "l", unit: "unit", unidade: "unit", unidades: "unit", pacote: "package", garrafa: "bottle", lata: "can", caixa: "box" };
const clean = (value: string) => value.replace(/[.!?]+$/g, "").trim();
const removeArticle = (value: string) => value.replace(/^(o|a|the|do|da|de)\s+/i, "");
const numberValue = (value: string) => words[value.toLocaleLowerCase()] ?? Number(value.replace(",", "."));

function parseAdd(text: string): AddAction[] {
  return text.replace(/^(comprei|adicion(ei|ar)?|bought|added)\s+/i, "").split(/\s+e\s+|\s+and\s+|\s*,\s*/i).map((part): AddAction | null => {
    const match = part.match(/^([\w,.]+)(?:\s+(kg|g|ml|l|unidades?|unit|pacotes?|garrafas?|latas?|caixas?|quilos?|litros?))?\s+(?:de|do|da|of)?\s*(.+)$/i);
    if (!match) return null;
    const quantity = numberValue(match[1]);
    if (!Number.isFinite(quantity)) return null;
    return { action: "add", item: clean(match[3]), quantity, unit: aliases[(match[2] ?? "unit").toLocaleLowerCase()] ?? "unit" };
  }).filter((item): item is AddAction => item !== null);
}

export function parseInventoryCommand(text: string): ParsedAction[] {
  const value = clean(text);
  if (!value) return [];

  const finished = value.match(/^(.+?)\s+(?:is\s+)?(?:finished|empty|is out of|ran out)$/i);
  if (finished) return [{ action: "mark_empty", item: removeArticle(clean(finished[1])) }];

  if (/^acabou\b/i.test(value)) {
    const item = removeArticle(clean(value.replace(/^acabou\s*/i, "")));
    return item ? [{ action: "mark_empty", item }] : [];
  }

  if (/(precisa ser usada|use soon|urgent|usar logo)/i.test(value)) {
    const item = clean(value.replace(/^.*?(essa|esse|this|that)\s+/i, "").replace(/\s+(precisa ser usada|use soon|urgent|usar logo).*$/i, ""));
    return item ? [{ action: "priority", item, priority: /urgent|urgente/i.test(value) ? "urgent" : "use_soon" }] : [];
  }

  if (/^(usei|consumi|used|ate|comi)\b/i.test(value)) {
    const match = value.match(/^(?:usei|consumi|used|ate|comi)\s+(.+)$/i);
    if (!match) return [];
    const rest = match[1];
    const half = /^(metade|half)\b/i.test(rest);
    const item = clean(rest.replace(/^(metade|half)\s+(?:de|do|da|of|the)?\s*/i, ""));
    return item ? [{ action: "consume", item, quantity: half ? null : 1 }] : [];
  }

  return /^(comprei|adicion(ei|ar)?|bought|added)\b/i.test(value) ? parseAdd(value) : [];
}
