import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build: dist/index.html is fully self-contained, so it can be
// double-clicked from disk (file://) — module scripts fetched from file:// are
// blocked by browsers, inlined ones are not. base './' keeps it hostable at any
// subpath (e.g. GitHub Pages) too.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
});
