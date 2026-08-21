import { sql } from "@/lib/db/client";
import { normalizeName, type Unit } from "@/lib/domain/inventory";

export async function listShopping() {
  return sql.unsafe("SELECT * FROM shopping_items ORDER BY checked ASC,created_at DESC");
}

export async function addShopping(name: string, quantity: number | null = null, unit: Unit = "unit") {
  const rows = await sql.unsafe("INSERT INTO shopping_items (name,normalized_name,quantity,unit) VALUES ($1,$2,$3,$4) RETURNING *", [name.trim(), normalizeName(name), quantity, unit]);
  return rows[0];
}

export async function updateShopping(id: string, input: { checked?: boolean; name?: string; quantity?: number | null; unit?: Unit }) {
  const current = await sql.unsafe("SELECT * FROM shopping_items WHERE id=$1 LIMIT 1", [id]);
  if (!current[0]) return null;
  const row = current[0];
  const rows = await sql.unsafe("UPDATE shopping_items SET name=$1,normalized_name=$2,quantity=$3,unit=$4,checked=$5,updated_at=now() WHERE id=$6 RETURNING *", [input.name ?? row.name, normalizeName(input.name ?? row.name), input.quantity === undefined ? row.quantity : input.quantity, input.unit ?? row.unit, input.checked ?? row.checked, id]);
  return rows[0];
}

export async function removeShopping(id: string) {
  await sql.unsafe("DELETE FROM shopping_items WHERE id=$1", [id]);
}
