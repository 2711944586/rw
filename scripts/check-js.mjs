import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const roots = ["src", "tests", "."];
const rootFiles = new Set(["vite.config.js", "vitest.config.js"]);
const jsExtensions = new Set([".js", ".mjs", ".cjs"]);
const ignoredDirs = new Set(["node_modules", "dist", "test-results", "output", ".git"]);

function collect(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collect(path, files);
      continue;
    }
    const rel = relative(process.cwd(), path).replaceAll("\\", "/");
    if (jsExtensions.has(extname(path)) && (rel.startsWith("src/") || rel.startsWith("tests/") || rootFiles.has(rel))) {
      files.push(path);
    }
  }
  return files;
}

const files = [...new Set(roots.flatMap((root) => collect(root)))].sort();
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files.`);
