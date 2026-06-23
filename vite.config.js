import { defineConfig } from 'vite';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

// Local Mock Backend for Testing Purchases
const purchaseSimulationPlugin = () => ({
  name: 'purchase-simulation',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/api/simulate-purchase' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const userEmail = data.email || 'test@example.com';
            
            const resend = new Resend('re_amEeGNYt_9NYdaG6BrfH2Xf5vNTPGFFwM');
            const htmlContent = fs.readFileSync(path.resolve(__dirname, 'email-template.html'), 'utf-8');
            
            const { error } = await resend.emails.send({
              from: 'onboarding@resend.dev',
              to: userEmail,
              subject: 'Your perc.store Purchase',
              html: htmlContent,
            });

            if (error) throw error;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
      } else {
        next();
      }
    });
  }
});

export default defineConfig({
  root: '.',
  plugins: [purchaseSimulationPlugin()],
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
