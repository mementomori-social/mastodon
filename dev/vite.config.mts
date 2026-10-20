// Upstream's Vite config with the live-reload socket moved to the site's own
// address, wss://mementomori.test, which Caddy passes to Vite. Then the page
// reloads itself after Vite re-bundles. dev/start.sh runs Vite with this file.
import { defineConfig, mergeConfig } from 'vite';
import type { ConfigEnv } from 'vite';

import { config } from '../vite.config.mts';

export default defineConfig(async (env: ConfigEnv) =>
  mergeConfig(await config(env), {
    server: {
      ws: {
        protocol: 'wss',
        host: process.env.DEV_DOMAIN ?? 'mementomori.test',
        clientPort: Number(process.env.PUBLIC_PORT ?? 443),
      },
    },
  }),
);
