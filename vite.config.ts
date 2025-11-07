// vite.config.ts

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Use relative asset paths so the app works at any subpath (e.g., /pricing-optimizer/)
const base = "./";

// PWA start_url/scope can still be absolute and per-env if you want installability
const pwaBase = process.env.VITE_PWA_BASE || "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-192.png",
        "icons/maskable-512.png",
      ],
      manifest: {
        name: "Pricing Optimizer",
        short_name: "PricingOpt",
        description: "Interactive Good/Better/Best pricing sandbox with pocket price waterfall, profit frontier, and optimizer.",
        theme_color: "#111827",
        background_color: "#ffffff",
        display: "standalone",
        start_url: pwaBase,
        scope: pwaBase,
        icons: [
          { src: "icons/icon-192.png",   sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png",   sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // cache the built assets and common static content
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),
  ],
  build: {
    // optional: hush the large-chunk warning a bit if you like
    outDir: "dist",
    chunkSizeWarningLimit: 1400,
  },
});
