import { sql } from "@/lib/db/client";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await sql.unsafe("SELECT 1");
    return NextResponse.json({ status: "ok", service: "sous" });
  } catch {
    return NextResponse.json({ status: "error", service: "sous" }, { status: 503 });
  }
}
