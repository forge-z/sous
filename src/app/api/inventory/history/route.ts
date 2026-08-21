import { getHistory } from "@/lib/domain/inventory";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const itemId = new URL(request.url).searchParams.get("itemId") ?? undefined;
    return NextResponse.json({ movements: await getHistory(itemId) });
  } catch (error) { return jsonError(error); }
}
