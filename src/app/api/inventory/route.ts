import { addInventory, listInventory } from "@/lib/domain/inventory";
import { jsonError } from "@/lib/http";
import { inventoryCreateSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ items: await listInventory() }); }
  catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const parsed = inventoryCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json(await addInventory(parsed.data), { status: 201 });
  } catch (error) { return jsonError(error, 400); }
}
