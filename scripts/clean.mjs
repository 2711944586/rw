import { rm } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const generatedPaths = [
  'dist',
  'output',
  'test-results',
  'playwright-report',
  '.playwright-cli',
  '.playwright-mcp',
];

for (const generatedPath of generatedPaths) {
  const target = resolve(projectRoot, generatedPath);
  const projectRelativePath = relative(projectRoot, target);
  if (!projectRelativePath || projectRelativePath.startsWith('..')) {
    throw new Error(`Refusing to clean outside the project: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
}

console.log(`Cleaned ${generatedPaths.join(', ')}.`);
