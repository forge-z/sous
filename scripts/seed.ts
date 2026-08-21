import postgres from "postgres";

async function main() {
  const client = postgres(process.env.DATABASE_URL ?? "postgres://sous:sous@localhost:5432/sous", { prepare: false });
  const items = [
    ["Chicken thighs", "1.4", "kg", "fridge", "use_soon"],
    ["Tomatoes", "6", "unit", "fridge", "normal"],
    ["Eggs", "8", "unit", "fridge", "normal"],
    ["Parmesan", "200", "g", "fridge", "normal"],
    ["Eggplant", "1", "unit", "pantry", "urgent"],
    ["Rice", "2", "kg", "pantry", "normal"],
    ["Olive oil", "500", "ml", "pantry", "normal"],
    ["White wine", "1", "bottle", "drinks", "use_soon"]
  ] as const;

  try {
    for (const [name, quantity, unit, location, priority] of items) {
      await client.unsafe(
        "INSERT INTO inventory_items (name, normalized_name, quantity, unit, location, priority, opened_at) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $1 = 'White wine' THEN current_date ELSE NULL END) ON CONFLICT (normalized_name, location, unit) DO NOTHING",
        [name, name.toLocaleLowerCase(), quantity, unit, location, priority]
      );
    }
    console.log("Fictional demo inventory loaded.");
  } finally {
    await client.end();
  }
}

void main();
