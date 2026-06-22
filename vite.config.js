import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
        purchase: './purchase.html',
        login: './login.html',
        dashboard: './dashboard.html',
        status: './status.html',
        media: './media.html',
        tos: './tos.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    allowedHosts: ['perc.store', 'www.perc.store']
  }
});
