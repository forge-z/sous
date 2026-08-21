import { getInventory, listInventory, addInventory, consumeInventory, markInventoryEmpty, updateInventory } from "@/lib/domain/inventory";
import { parseInventoryCommand } from "@/lib/natural-language/parser";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; confirm?: boolean };
    const actions = parseInventoryCommand(body.text ?? "");
    if (!actions.length) return NextResponse.json({ error: "Could not understand the command" }, { status: 422 });
    if (!body.confirm) return NextResponse.json({ actions, requiresConfirmation: true });

    const inventory = await listInventory();
    const results = [];
    for (const action of actions) {
      const item = inventory.find((candidate) => candidate.normalized_name === action.item.toLocaleLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""));
      if (action.action === "add") results.push(await addInventory({ name: action.item, quantity: action.quantity, unit: action.unit }));
      else if (!item) results.push({ action, error: "Item not found in inventory" });
      else if (action.action === "consume") results.push(await consumeInventory(item.id, action.quantity ?? undefined));
      else if (action.action === "mark_empty") results.push(await markInventoryEmpty(item.id));
      else results.push(await updateInventory(item.id, { priority: action.priority }));
    }
    return NextResponse.json({ results });
  } catch (error) { return jsonError(error, 400); }
}
