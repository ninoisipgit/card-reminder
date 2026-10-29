// Lets Node run the app's TypeScript directly in tests:
// resolves '@/x' to src/x and extensionless imports to .ts files.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcDir = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  let spec = specifier;
  if (spec.startsWith('@/')) spec = new URL(spec.slice(2), srcDir).href;
  const isPath = spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('file:');
  if (isPath && !/\.[cm]?[jt]sx?$/.test(spec)) {
    const base = new URL(spec, context.parentURL);
    for (const ext of ['.ts', '/index.ts']) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(pathToFileURL(fileURLToPath(candidate)).href, context);
    }
  }
  return nextResolve(spec, context);
}
