import { markInventoryEmpty } from "@/lib/domain/inventory";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try { return NextResponse.json(await markInventoryEmpty(params.id)); }
  catch (error) { return jsonError(error, 400); }
}
