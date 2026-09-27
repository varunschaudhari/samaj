import { defineConfig } from 'tsup';

export default defineConfig({
  // migrate.js ships with the server so a deployment can build indexes before it starts.
  entry: ['src/server.ts', 'src/scripts/migrate.ts', 'src/scripts/privacy-purge.ts'],
  format: 'esm',
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript source, so bundle it instead of importing it at runtime.
  noExternal: ['@samaj/shared'],
});
