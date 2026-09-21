/* Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only */
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const shared = resolve(__dirname, 'src/shared')

/**
 * The production Content Security Policy, which ships in index.html.
 *
 * It lives in a meta tag rather than a webRequest header because packaged
 * builds load the renderer over `file://`, and Electron does not run
 * `onHeadersReceived` for that protocol.
 *
 * `style-src` allows inline styles because Griffel, the CSS-in-JS engine
 * behind Fluent UI, injects rules into a style element at runtime.
 */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ')

/**
 * The dev server needs two relaxations the packaged app must not have: the
 * React Refresh preamble is an inline script, and HMR talks over a websocket.
 */
const DEVELOPMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ')

/**
 * Swaps the CSP in index.html for the relaxed one while serving in dev.
 *
 * The match is a literal string shared with `src/renderer/index.html`. If the
 * two ever drift, a silent no-op would leave the dev server running under the
 * production policy and break React Refresh with a confusing CSP error, so a
 * miss fails the build instead.
 */
function devCspPlugin(): Plugin {
  return {
    name: 'barista-dev-csp',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => {
        if (!html.includes(PRODUCTION_CSP)) {
          throw new Error(
            'barista-dev-csp: the Content-Security-Policy in src/renderer/index.html no longer ' +
              'matches PRODUCTION_CSP in electron.vite.config.ts. Update both together.'
          )
        }
        return html.replace(PRODUCTION_CSP, DEVELOPMENT_CSP)
      }
    }
  }
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          renderWorker: resolve(__dirname, 'src/main/printing/renderWorker.ts')
        },
        // These standard drivers expose optional native accelerators through dynamic require.
        // Keep the packages external so Node resolves only the pure-JavaScript paths Barista uses;
        // bundling them turns Vite's optional-peer guard into an eager startup exception.
        external: ['pg', 'ws']
      }
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@shared': shared
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          splash: resolve(__dirname, 'src/preload/splash.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': shared
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          splash: resolve(__dirname, 'src/renderer/splash.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': shared
      }
    },
    plugins: [react(), devCspPlugin()]
  }
})
