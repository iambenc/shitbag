import { pgTable, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops, seedInventory } from "./crop";
import { equipmentTypes } from "./equipment";
import { tenantIsolationPolicy } from "./_rls";

export const shoppingItemStatusEnum = ["pending", "purchased"] as const;
export type ShoppingItemStatus = (typeof shoppingItemStatusEnum)[number];

export const shoppingItemSourceEnum = ["manual", "ai"] as const;
export type ShoppingItemSource = (typeof shoppingItemSourceEnum)[number];

export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Exactly one of these is set — a catalog crop, an equipment type, or a
    // free-text manual item.
    cropId: uuid("crop_id").references(() => crops.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id").references(() => equipmentTypes.id, { onDelete: "cascade" }),
    freeText: text("free_text"),
    quantityLabel: text("quantity_label").notNull(),
    status: text("status", { enum: shoppingItemStatusEnum }).notNull().default("pending"),
    source: text("source", { enum: shoppingItemSourceEnum }).notNull().default("manual"),
    // Set the first time this item is confirmed purchased and it's a crop
    // (toggleShoppingItemAction inserts a seedInventory row and links back
    // here) — both an idempotency guard (toggling purchased on/off/on again
    // must not insert a second row) and a record of what that confirmation
    // produced. "set null" not "cascade": deleting the seed-inventory row
    // later (e.g. the user removes it from /seeds) shouldn't take this
    // already-purchased shopping item with it.
    seedInventoryId: uuid("seed_inventory_id").references(() => seedInventory.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantIsolationPolicy("shopping_list_items", table.tenantId),
    check(
      "shopping_list_items_exactly_one_of",
      sql`num_nonnulls(${table.cropId}, ${table.freeText}, ${table.equipmentTypeId}) = 1`,
    ),
  ],
).enableRLS();
