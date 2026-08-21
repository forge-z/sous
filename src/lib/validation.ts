import { z } from "zod";

export const unitSchema = z.enum(["unit", "g", "kg", "ml", "l", "package", "bottle", "can", "box"]);
export const locationSchema = z.enum(["fridge", "freezer", "pantry", "drinks", "other"]);
export const prioritySchema = z.enum(["normal", "use_soon", "urgent"]);
export const quantityStateSchema = z.enum(["full", "enough", "half", "low", "almost_empty", "empty"]);

export const inventoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: unitSchema.default("unit"),
  quantityState: quantityStateSchema.nullable().optional(),
  category: z.string().trim().max(80).default("other"),
  location: locationSchema.default("pantry"),
  expiresAt: z.string().date().nullable().optional(),
  openedAt: z.string().date().nullable().optional(),
  priority: prioritySchema.default("normal"),
  notes: z.string().trim().max(500).nullable().optional()
});

export const inventoryUpdateSchema = inventoryCreateSchema.partial();
export const movementSchema = z.object({
  quantity: z.number().positive().optional(),
  note: z.string().trim().max(500).optional()
});
export const shoppingCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().nullable().optional(),
  unit: unitSchema.default("unit")
});
