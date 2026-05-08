import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standaloneDir = join(root, ".next", "standalone");
const standaloneNextDir = join(standaloneDir, ".next");

if (!existsSync(standaloneDir)) {
  process.exit(0);
}

function copyFresh(from, to) {
  if (!existsSync(from)) {
    return;
  }

  rmSync(to, { force: true, recursive: true });
  mkdirSync(join(to, ".."), { recursive: true });
  cpSync(from, to, { recursive: true });
}

copyFresh(join(root, "public"), join(standaloneDir, "public"));
copyFresh(join(root, ".next", "static"), join(standaloneNextDir, "static"));
