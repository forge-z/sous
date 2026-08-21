import { sql } from "@/lib/db/client";
import { getInventory, updateInventory, type Priority, type QuantityState, type Unit } from "@/lib/domain/inventory";

export async function discardInventory(id: string, quantity: number, note = "Discarded") {
  const current = await getInventory(id);
  if (!current) throw new Error("Inventory item not found");
  if (current.quantity !== null && quantity > current.quantity) throw new Error("Not enough inventory");
  const nextQuantity = current.quantity === null ? null : Math.max(0, current.quantity - quantity);
  const item = await updateInventory(id, { quantity: nextQuantity, quantityState: nextQuantity === 0 ? "empty" : current.quantity_state });
  await sql.unsafe("INSERT INTO inventory_movements (item_id,movement_type,quantity,unit,note) VALUES ($1,'discard',$2,$3,$4)", [id, quantity, current.unit, note]);
  return item;
}

export async function adjustInventory(id: string, input: { quantity?: number | null; quantityState?: QuantityState | null; unit?: Unit; note?: string }) {
  const current = await getInventory(id);
  if (!current) throw new Error("Inventory item not found");
  const item = await updateInventory(id, { quantity: input.quantity, quantityState: input.quantityState, unit: input.unit });
  await sql.unsafe("INSERT INTO inventory_movements (item_id,movement_type,quantity,unit,note) VALUES ($1,'adjust',$2,$3,$4)", [id, input.quantity ?? null, input.unit ?? current.unit, input.note ?? "Adjusted inventory"]);
  return item;
}

export async function setInventoryPriority(id: string, priority: Priority) {
  return updateInventory(id, { priority });
}
