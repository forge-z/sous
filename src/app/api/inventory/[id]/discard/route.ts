import { discardInventory } from "@/lib/domain/inventory-actions";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as { quantity?: number; note?: string };
    if (!body.quantity || body.quantity <= 0) return NextResponse.json({ error: "quantity must be positive" }, { status: 400 });
    return NextResponse.json(await discardInventory(params.id, body.quantity, body.note));
  } catch (error) { return jsonError(error, 400); }
}
