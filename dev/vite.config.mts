// Upstream's Vite config with the live-reload socket moved to the site's own
// address, wss://mementomori.test, where Caddy sends /packs-dev to Vite. Then
// the page reloads itself after Vite re-bundles. dev/start.sh runs Vite with it.
import { defineConfig, mergeConfig } from 'vite';
import type { ConfigEnv } from 'vite';

import { config } from '../vite.config.mts';

export default defineConfig(async (env: ConfigEnv) =>
  mergeConfig(await config(env), {
    server: {
      // Caddy reaches Vite from its own container
      host: '0.0.0.0',
      // Podman on macOS passes no file change events into its VM
      watch: process.env.DEV_WATCH_POLLING ? { usePolling: true, interval: 500 } : undefined,
      ws: {
        protocol: 'wss',
        host: process.env.DEV_DOMAIN ?? 'mementomori.test',
        clientPort: Number(process.env.PUBLIC_PORT ?? 443),
      },
    },
  }),
);
