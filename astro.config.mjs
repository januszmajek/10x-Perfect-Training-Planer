// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    ssr: {
      optimizeDeps: {
        include: [
          "@supabase/ssr",
          "astro/env/runtime",
          "react",
          "react-dom",
          "react-dom/server",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
        ],
      },
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      AI_KEY_ENCRYPTION_KEY_V1: envField.string({ context: "server", access: "secret", optional: true }),
      OPENROUTER_MODEL: envField.string({ context: "server", access: "secret", optional: true }),
      AI_CONFIRMATION_SIGNING_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
