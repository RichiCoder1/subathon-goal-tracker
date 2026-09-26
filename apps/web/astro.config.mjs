// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite'
import auth from "auth-astro";

// https://astro.build/config
export default defineConfig({
  integrations: [react(), auth({injectEndpoints:false})],
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  }),

  vite: {
    build: {
      sourcemap: true,
    },
    ssr: {
      external: ['node:path']
    },

    resolve: {
      // Use react-dom/server.edge instead of react-dom/server.browser for React 19.
      // Without this, MessageChannel from node:worker_threads needs to be polyfilled.
      alias: import.meta.env.PROD ? {
        "react-dom/server": "react-dom/server.edge",
      } : {},
    },

    server: {
      allowedHosts: ["localhost:4321", "app-subathon-goal-tracker-local.richi.dev"],
    },

    plugins: [tailwindcss()]
  }
});
