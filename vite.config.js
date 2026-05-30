import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separate Supabase and infrastructure from main bundle
          if (id.includes('node_modules/@supabase') || id.includes('node_modules/whatwg')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/lucide')) {
            return 'vendor-icons';
          }
          // Separate domain modules from views when they are independently imported
          if (id.includes('/src/domain/')) {
            return 'domain';
          }
          if (id.includes('/src/infrastructure/')) {
            return 'infra';
          }
        },
      },
    },
  },
});
