import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { addInventory, consumeInventory, getExpiringInventory, getHistory, getInventory, listInventory, markInventoryEmpty } from "@/lib/domain/inventory";
import { adjustInventory, discardInventory, setInventoryPriority } from "@/lib/domain/inventory-actions";
import { addShopping, listShopping, removeShopping } from "@/lib/domain/shopping";

const server = new McpServer({ name: "sous", version: "0.1.0" });
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

server.tool("inventory_list", "List the persistent kitchen inventory.", {}, async () => text(await listInventory()));
server.tool("inventory_get", "Get one inventory item.", { id: z.string() }, async ({ id }) => text(await getInventory(id)));
server.tool("inventory_expiring", "List items expiring within three days.", {}, async () => text(await getExpiringInventory()));
server.tool("inventory_history", "List inventory movements.", {}, async () => text(await getHistory()));
server.tool("inventory_add", "Add a purchase to inventory.", { name: z.string(), quantity: z.number().nullable().optional(), unit: z.string().optional() }, async ({ name, quantity, unit }) => text(await addInventory({ name, quantity, unit: (unit ?? "unit") as never })));
server.tool("inventory_consume", "Consume an inventory item.", { id: z.string(), quantity: z.number().positive().optional() }, async ({ id, quantity }) => text(await consumeInventory(id, quantity)));
server.tool("inventory_discard", "Discard part of an inventory item.", { id: z.string(), quantity: z.number().positive() }, async ({ id, quantity }) => text(await discardInventory(id, quantity)));
server.tool("inventory_adjust", "Set a corrected inventory quantity or qualitative state.", { id: z.string(), quantity: z.number().nullable().optional(), quantityState: z.string().nullable().optional() }, async ({ id, quantity, quantityState }) => text(await adjustInventory(id, { quantity, quantityState: quantityState as never })));
server.tool("inventory_mark_empty", "Mark an inventory item empty.", { id: z.string() }, async ({ id }) => text(await markInventoryEmpty(id)));
server.tool("inventory_priority", "Set an inventory priority.", { id: z.string(), priority: z.enum(["normal", "use_soon", "urgent"]) }, async ({ id, priority }) => text(await setInventoryPriority(id, priority)));
server.tool("shopping_list_get", "List shopping items.", {}, async () => text(await listShopping()));
server.tool("shopping_list_add", "Add an item to the shopping list.", { name: z.string(), quantity: z.number().nullable().optional() }, async ({ name, quantity }) => text(await addShopping(name, quantity)));
server.tool("shopping_list_remove", "Remove an item from the shopping list.", { id: z.string() }, async ({ id }) => { await removeShopping(id); return text({ ok: true }); });

const transport = new StdioServerTransport();
await server.connect(transport);
