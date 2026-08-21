import { adjustInventory } from "@/lib/domain/inventory-actions";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as { quantity?: number | null; quantityState?: "full" | "enough" | "half" | "low" | "almost_empty" | "empty" | null; unit?: string; note?: string };
    return NextResponse.json(await adjustInventory(params.id, body as never));
  } catch (error) { return jsonError(error, 400); }
}
