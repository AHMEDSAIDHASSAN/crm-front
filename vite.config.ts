import type { ServerResponse } from 'http';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path';

/** Same as production (Vercel /api → backend). Dev server forwards /api/* to Nest (no CORS hassle). */
const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:2003';

function isHttpResponse(res: unknown): res is ServerResponse {
  return (
    typeof res === 'object' &&
    res !== null &&
    'writeHead' in res &&
    typeof (res as ServerResponse).writeHead === 'function' &&
    'headersSent' in res
  );
}

let lastEconnRefusedLog = 0;

/** Avoid flooding the terminal when the API is not running (ECONNREFUSED on every poll/reconnect). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vite passes http-proxy; structural typing is overly strict
function quietProxyRefused(proxy: any) {
  proxy.on('error', (err: NodeJS.ErrnoException, _req: unknown, res: unknown) => {
    if (err.code === 'ECONNREFUSED') {
      const now = Date.now();
      if (now - lastEconnRefusedLog > 15000) {
        lastEconnRefusedLog = now;
        console.warn(
          `[vite proxy] backend unreachable (${API_PROXY_TARGET}). Start the API: npm run dev:backend from the repo root, or use npm run dev to run both.`,
        );
      }
      if (isHttpResponse(res) && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Backend unavailable');
      }
      return;
    }
    console.error('[vite proxy]', err);
  });
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        rewrite: (p) => {
          const stripped = p.replace(/^\/api/, '');
          return stripped === '' ? '/' : stripped;
        },
        configure: (proxy) => quietProxyRefused(proxy),
      },
      '/socket.io': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => quietProxyRefused(proxy),
      },
    },
  },
});
