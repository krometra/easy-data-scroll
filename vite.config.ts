import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import { pictureSvg } from './demo/shared/picture'

function images(): Plugin {
  return {
    name: 'demo-images',
    configureServer(server) {
      server.middlewares.use('/img', (req, res) => {
        const q = new URL(req.url ?? '/', 'http://local').searchParams
        const w = Number(q.get('w')) || 480
        const h = Number(q.get('h')) || 320
        const seed = Number(q.get('seed')) || 1
        const delay = Math.min(Number(q.get('delay')) || 0, 10_000)
        const svg = pictureSvg(w, h, seed)
        setTimeout(() => {
          res.setHeader('Content-Type', 'image/svg+xml')
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.end(svg)
        }, delay)
      })
    },
  }
}

export default defineConfig({
  root: 'demo',
  base: process.env.BASE ?? '/',
  plugins: [vue(), images()],
  resolve: {
    alias: [
      { find: /^@krometra\/easy-data-scroll\/(vue|react|angular)$/, replacement: resolve('src/$1') },
      { find: /^@krometra\/easy-data-scroll$/, replacement: resolve('src/index.ts') },
    ],
  },
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  server: { port: 5179, strictPort: true },
  build: {
    outDir: resolve('dist-demo'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve('demo/index.html'),
        chat: resolve('demo/chat.html'),
        feed: resolve('demo/feed.html'),
        virtual: resolve('demo/virtual.html'),
        vue: resolve('demo/vue.html'),
        react: resolve('demo/react.html'),
        angular: resolve('demo/angular.html'),
      },
    },
  },
})
