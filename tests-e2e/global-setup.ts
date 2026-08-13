import fs from "node:fs";
import path from "node:path";

/**
 * Several spec files share one onboarded user across their tests via a
 * per-file storageState JSON (written in each file's own beforeAll, read
 * via test.use) — see calendar.spec.ts/seeds.spec.ts/grow-plan.spec.ts.
 * context.storageState({ path }) doesn't create missing parent directories
 * itself, so without this every one of those beforeAll hooks fails on a
 * fresh checkout that's never had a tests-e2e/.auth/ directory before.
 */
export default async function globalSetup() {
  fs.mkdirSync(path.join(__dirname, ".auth"), { recursive: true });
}
