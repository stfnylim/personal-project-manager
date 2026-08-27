import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bake endpoints into local builds: the configs sit at the repo root and are
// gitignored, so CI/hosted builds never have them and fall back to the connect
// screen — only builds made on a configured machine come out pre-connected.
// PM_CONFIG selects which config(s) get baked, comma-separable for a merged
// multi-source dashboard:
//   PM_CONFIG=config.life.json npm --prefix ui run build                    (single)
//   PM_CONFIG=config.work.json,config.life.json npm --prefix ui run build   (global)
// (defaults to config.work.json)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configFiles = (process.env.PM_CONFIG ?? 'config.work.json').split(',').map((f) => f.trim()).filter(Boolean);

interface BakedSource {
  id: string;
  label: string;
  url: string;
  token: string;
  writeSecret?: string;
  projectsDir?: string;
}

const baked: BakedSource[] = [];
for (const file of configFiles) {
  const path = resolve(root, file);
  if (!existsSync(path)) continue;
  try {
    const c = JSON.parse(readFileSync(path, 'utf8')) as {
      webhookUrl?: string;
      readToken?: string;
      secret?: string;
      projectsDir?: string;
      label?: string;
    };
    if (c.webhookUrl && !c.webhookUrl.startsWith('PASTE') && c.readToken) {
      // label: explicit "label" key, else the config filename ("config.life.json" → "Life")
      const m = file.match(/config\.([^.]+)\.json$/);
      const label = c.label ?? (m ? m[1][0].toUpperCase() + m[1].slice(1) : 'PM');
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pm';
      baked.push({ id, label, url: c.webhookUrl, token: c.readToken, writeSecret: c.secret, projectsDir: c.projectsDir });
    }
  } catch {
    /* unreadable config — skip */
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
    __PM_SOURCES__: JSON.stringify(baked.length ? baked : null),
  },
});
