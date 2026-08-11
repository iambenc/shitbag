ALTER TABLE "partner_links" ALTER COLUMN "equipment_type_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_links" ADD COLUMN "crop_id" uuid;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_exactly_one_of" CHECK (num_nonnulls("partner_links"."equipment_type_id", "partner_links"."crop_id") = 1);