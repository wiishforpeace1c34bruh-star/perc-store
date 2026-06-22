import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
        fisch: './fisch.html',
        toolkit: './toolkit.html',
        why_us: './why-us.html',
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
