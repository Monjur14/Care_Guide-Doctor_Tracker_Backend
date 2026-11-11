import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    app: 'src/vercel.ts',
    server: 'src/server.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Inline the workspace package (it ships TypeScript source); keep npm deps external.
  noExternal: [/^@doctor-tracker\//],
});
