import { setInventoryPriority } from "@/lib/domain/inventory-actions";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as { priority?: "normal" | "use_soon" | "urgent" };
    if (!body.priority) return NextResponse.json({ error: "priority is required" }, { status: 400 });
    const item = await setInventoryPriority(params.id, body.priority);
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) { return jsonError(error, 400); }
}
