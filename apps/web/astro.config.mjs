// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  output: 'server',
  session: false, // Auth.js uses signed cookies; no separate KV session store is needed.
  integrations: [react()],
  adapter: cloudflare({
    imageService: 'passthrough',
  }),

  vite: {
    build: {
      sourcemap: true,
    },
    server: {
      allowedHosts: ["localhost:4321", "app-subathon-goal-tracker-local.richi.dev"],
    },

    plugins: [tailwindcss()]
  }
});
