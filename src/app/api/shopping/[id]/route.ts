import { removeShopping, updateShopping } from "@/lib/domain/shopping";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const item = await updateShopping(params.id, await request.json());
    return item ? NextResponse.json(item) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) { return jsonError(error, 400); }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try { await removeShopping(params.id); return new NextResponse(null, { status: 204 }); }
  catch (error) { return jsonError(error, 400); }
}
