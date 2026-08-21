import { listInventory } from "@/lib/domain/inventory";
import { getAIProvider } from "@/lib/providers";
import { jsonError } from "@/lib/http";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { people?: number; minutes?: number; style?: string; restrictions?: string };
    const inventory = await listInventory();
    const focus = inventory.filter((item) => item.priority !== "normal" || item.quantity_state !== "empty").slice(0, 12);
    const inventoryText = focus.map((item) => item.name + " (" + (item.quantity ?? item.quantity_state ?? "some") + " " + item.unit + ")").join(", ");
    const prompt = "Suggest one practical meal for " + (body.people ?? 2) + " people in " + (body.minutes ?? 40) + " minutes. Style: " + (body.style ?? "any") + ". Restrictions: " + (body.restrictions ?? "none") + ". Prioritise: " + inventoryText;
    const suggestion = await getAIProvider().complete([
      { role: "system", content: "You are Sous, a concise household cooking assistant. Use the provided inventory and never invent stock." },
      { role: "user", content: prompt }
    ]);
    return NextResponse.json({ suggestion, inventory: focus });
  } catch (error) { return jsonError(error, 400); }
}
