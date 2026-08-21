import { sql } from "@/lib/db/client";

export type Unit = "unit" | "g" | "kg" | "ml" | "l" | "package" | "bottle" | "can" | "box";
export type Location = "fridge" | "freezer" | "pantry" | "drinks" | "other";
export type Priority = "normal" | "use_soon" | "urgent";
export type QuantityState = "full" | "enough" | "half" | "low" | "almost_empty" | "empty";

export type InventoryItem = {
  id: string; name: string; normalized_name: string; quantity: number | null; unit: Unit;
  quantity_state: QuantityState | null; category: string; location: Location;
  expires_at: string | null; opened_at: string | null; priority: Priority;
  notes: string | null; created_at: string; updated_at: string;
};

export type InventoryInput = {
  name: string; quantity?: number | null; unit?: Unit; quantityState?: QuantityState | null;
  category?: string; location?: Location; expiresAt?: string | null; openedAt?: string | null;
  priority?: Priority; notes?: string | null;
};

export const normalizeName = (name: string) => name.trim().toLocaleLowerCase("pt-BR")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

const mapItem = (row: Record<string, unknown>): InventoryItem => ({
  ...(row as Omit<InventoryItem, "quantity">),
  quantity: row.quantity == null ? null : Number(row.quantity)
});

export async function listInventory() {
  const rows = await sql.unsafe("SELECT * FROM inventory_items ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'use_soon' THEN 1 ELSE 2 END, expires_at NULLS LAST, name ASC");
  return rows.map(mapItem);
}

export async function getInventory(id: string) {
  const rows = await sql.unsafe("SELECT * FROM inventory_items WHERE id=$1 LIMIT 1", [id]);
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function addInventory(input: InventoryInput) {
  const name = input.name.trim();
  const normalized = normalizeName(name);
  const unit = input.unit ?? "unit";
  const location = input.location ?? "pantry";

  return sql.begin(async (tx) => {
    const existing = await tx.unsafe("SELECT * FROM inventory_items WHERE normalized_name=$1 AND location=$2 AND unit=$3 LIMIT 1 FOR UPDATE", [normalized, location, unit]);
    const rows = existing[0]
      ? await tx.unsafe("UPDATE inventory_items SET quantity=CASE WHEN $1::numeric IS NULL THEN quantity ELSE COALESCE(quantity,0)+$1::numeric END, quantity_state=COALESCE($2,quantity_state), priority=COALESCE($3,priority), updated_at=now() WHERE id=$4 RETURNING *", [input.quantity ?? null, input.quantityState ?? null, input.priority ?? null, existing[0].id])
      : await tx.unsafe("INSERT INTO inventory_items (name,normalized_name,quantity,unit,quantity_state,category,location,expires_at,opened_at,priority,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *", [name, normalized, input.quantity ?? null, unit, input.quantityState ?? null, input.category ?? "other", location, input.expiresAt ?? null, input.openedAt ?? null, input.priority ?? "normal", input.notes ?? null]);
    const item = mapItem(rows[0]);
    await tx.unsafe("INSERT INTO inventory_movements (item_id,movement_type,quantity,unit,note) VALUES ($1,'purchase',$2,$3,$4)", [item.id, input.quantity ?? null, unit, "Added through Sous"]);
    return item;
  });
}

export async function updateInventory(id: string, input: Partial<InventoryInput>) {
  const current = await getInventory(id);
  if (!current) return null;
  const next = {
    name: input.name ?? current.name, normalized: normalizeName(input.name ?? current.name),
    quantity: input.quantity === undefined ? current.quantity : input.quantity,
    unit: input.unit ?? current.unit, quantityState: input.quantityState === undefined ? current.quantity_state : input.quantityState,
    category: input.category ?? current.category, location: input.location ?? current.location,
    expiresAt: input.expiresAt === undefined ? current.expires_at : input.expiresAt,
    openedAt: input.openedAt === undefined ? current.opened_at : input.openedAt,
    priority: input.priority ?? current.priority, notes: input.notes === undefined ? current.notes : input.notes
  };
  const rows = await sql.unsafe("UPDATE inventory_items SET name=$1,normalized_name=$2,quantity=$3,unit=$4,quantity_state=$5,category=$6,location=$7,expires_at=$8,opened_at=$9,priority=$10,notes=$11,updated_at=now() WHERE id=$12 RETURNING *", [next.name, next.normalized, next.quantity, next.unit, next.quantityState, next.category, next.location, next.expiresAt, next.openedAt, next.priority, next.notes, id]);
  return rows[0] ? mapItem(rows[0]) : null;
}

export async function consumeInventory(id: string, quantity?: number, note = "Consumed") {
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe("SELECT * FROM inventory_items WHERE id=$1 LIMIT 1 FOR UPDATE", [id]);
    if (!rows[0]) throw new Error("Inventory item not found");
    const current = mapItem(rows[0]);
    if (quantity !== undefined && current.quantity !== null && quantity > current.quantity) throw new Error("Not enough inventory");
    const amount = quantity ?? current.quantity ?? 0;
    const next = quantity === undefined ? 0 : Math.max(0, (current.quantity ?? 0) - quantity);
    const state = next === 0 ? "empty" : current.quantity === null ? "low" : current.quantity_state;
    const updated = await tx.unsafe("UPDATE inventory_items SET quantity=$1,quantity_state=$2,updated_at=now() WHERE id=$3 RETURNING *", [next, state, id]);
    await tx.unsafe("INSERT INTO inventory_movements (item_id,movement_type,quantity,unit,note) VALUES ($1,'consume',$2,$3,$4)", [id, amount, current.unit, note]);
    return mapItem(updated[0]);
  });
}

export async function markInventoryEmpty(id: string) {
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe("SELECT * FROM inventory_items WHERE id=$1 LIMIT 1 FOR UPDATE", [id]);
    if (!rows[0]) throw new Error("Inventory item not found");
    const updated = await tx.unsafe("UPDATE inventory_items SET quantity=0,quantity_state='empty',updated_at=now() WHERE id=$1 RETURNING *", [id]);
    await tx.unsafe("INSERT INTO inventory_movements (item_id,movement_type,quantity,unit,note) VALUES ($1,'empty',0,$2,$3)", [id, rows[0].unit, "Marked empty"]);
    return mapItem(updated[0]);
  });
}

export async function getHistory(itemId?: string) {
  return itemId
    ? sql.unsafe("SELECT * FROM inventory_movements WHERE item_id=$1 ORDER BY created_at DESC", [itemId])
    : sql.unsafe("SELECT m.*,i.name FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id ORDER BY m.created_at DESC LIMIT 200");
}

export async function getExpiringInventory(days = 3) {
  const rows = await sql.unsafe("SELECT * FROM inventory_items WHERE expires_at IS NOT NULL AND expires_at <= current_date + $1::int AND quantity_state IS DISTINCT FROM 'empty' ORDER BY expires_at ASC", [days]);
  return rows.map(mapItem);
}
