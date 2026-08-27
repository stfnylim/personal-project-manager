import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bake the endpoint into local builds: the config sits at the repo root and is
// gitignored, so CI/hosted builds never have it and fall back to the connect
// screen — only builds made on a configured machine come out pre-connected.
// Which config gets baked is selectable per instance:
//   PM_CONFIG=config.life.json npm --prefix ui run build   (defaults to config.work.json)
const configFile = process.env.PM_CONFIG ?? 'config.work.json';
const configPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', configFile);
let baked: { url: string; token: string; writeSecret?: string } | null = null;
if (existsSync(configPath)) {
  try {
    const c = JSON.parse(readFileSync(configPath, 'utf8')) as { webhookUrl?: string; readToken?: string; secret?: string };
    if (c.webhookUrl && !c.webhookUrl.startsWith('PASTE') && c.readToken) {
      baked = { url: c.webhookUrl, token: c.readToken, writeSecret: c.secret };
    }
  } catch {
    /* unreadable config — build without baked endpoint */
  }
}

// Single-file build: dist/index.html is fully self-contained, so it can be
// double-clicked from disk (file://) — module scripts fetched from file:// are
// blocked by browsers, inlined ones are not. base './' keeps it hostable at any
// subpath (e.g. GitHub Pages) too.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  define: {
    __PM_ENDPOINT__: JSON.stringify(baked),
  },
});
