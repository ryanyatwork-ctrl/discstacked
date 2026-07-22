import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,webp}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            // Always try the current deployment before falling back to the
            // installed app shell. This prevents Chrome from restoring an old
            // JavaScript bundle after the browser is restarted.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "discstacked-pages-v1",
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(picsum\.photos|image\.tmdb\.org|i\.discogs\.com|img\.discogs\.com|coverartarchive\.org|images\.igdb\.com|media\.rawg\.io)\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "collector-artwork-v2",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("html5-qrcode")) return "scanner";
          if (id.includes("recharts")) return "charts";
          if (id.includes("@supabase/supabase-js") || id.includes("@tanstack/react-query")) return "data";
          if (id.includes("react-dom") || id.includes("react-router-dom") || id.includes("\\react\\") || id.includes("/react/")) return "react";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
