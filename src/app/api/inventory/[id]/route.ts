import { getInventory, updateInventory } from "@/lib/domain/inventory";
import { jsonError } from "@/lib/http";
import { inventoryUpdateSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

type Context = { params: { id: string } };

export async function GET(_: Request, { params }: Context) {
  try {
    const item = await getInventory(params.id);
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const parsed = inventoryUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const item = await updateInventory(params.id, parsed.data);
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) { return jsonError(error, 400); }
}
