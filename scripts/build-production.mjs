import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const result = spawnSync(
  process.execPath,
  ["node_modules/astro/bin/astro.mjs", "build"],
  {
    cwd: web,
    env: { ...process.env, CLOUDFLARE_ENV: "production" },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
