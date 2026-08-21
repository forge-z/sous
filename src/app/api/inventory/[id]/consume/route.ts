import { consumeInventory } from "@/lib/domain/inventory";
import { jsonError } from "@/lib/http";
import { movementSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const parsed = movementSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json(await consumeInventory(params.id, parsed.data.quantity, parsed.data.note));
  } catch (error) { return jsonError(error, 400); }
}
