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
    // Vite inlines assets below 4 KB as base64 data URIs. The @fontsource
    // woff2 subsets are the only assets small enough to hit that path, and the
    // production CSP declares `font-src 'self'` — which refuses `data:` — so
    // those characters silently fell back to a system font in production.
    // Emitting them as real files keeps the strict CSP intact and lets each
    // subset be cached on its own.
    assetsInlineLimit: 0,
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
