import { pgTable, uuid, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops } from "./crop";
import { tenantIsolationPolicy } from "./_rls";

export const shoppingItemStatusEnum = ["pending", "purchased"] as const;
export type ShoppingItemStatus = (typeof shoppingItemStatusEnum)[number];

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
    // Exactly one of these is set — a catalog crop, or a free-text manual item.
    cropId: uuid("crop_id").references(() => crops.id, { onDelete: "cascade" }),
    freeText: text("free_text"),
    quantityLabel: text("quantity_label").notNull(),
    status: text("status", { enum: shoppingItemStatusEnum }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantIsolationPolicy("shopping_list_items", table.tenantId),
    check(
      "shopping_list_items_crop_xor_free_text",
      sql`(${table.cropId} is not null) <> (${table.freeText} is not null)`,
    ),
  ],
).enableRLS();
