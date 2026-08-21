import { getExpiringInventory } from "@/lib/domain/inventory";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function GET() {
  try { return NextResponse.json({ items: await getExpiringInventory() }); }
  catch (error) { return jsonError(error); }
}
