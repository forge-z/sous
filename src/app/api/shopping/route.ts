import { addShopping, listShopping } from "@/lib/domain/shopping";
import { jsonError } from "@/lib/http";
import { shoppingCreateSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function GET() {
  try { return NextResponse.json({ items: await listShopping() }); }
  catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const parsed = shoppingCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    return NextResponse.json(await addShopping(parsed.data.name, parsed.data.quantity, parsed.data.unit), { status: 201 });
  } catch (error) { return jsonError(error, 400); }
}
