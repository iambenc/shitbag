import { redirect } from "next/navigation";

// Seed inventory moved to /my-shed (alongside equipment inventory) — this
// redirect keeps any existing bookmarks/links working.
export default function SeedsPage() {
  redirect("/my-shed");
}
