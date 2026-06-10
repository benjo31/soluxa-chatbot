import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import './src/db.js'; // init DB
import { publicRouter } from './src/routes/public.js';
import { adminRouter } from './src/routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// API
app.use('/api/public', publicRouter);
app.use('/api/admin', adminRouter);

// Widget statique (avec en-têtes CORS permissifs car appelé depuis n'importe quel site)
app.get('/widget.js', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});

// Dashboard admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.get('/admin', (req, res) => res.redirect('/admin/'));

// Racine → redirige vers admin
app.get('/', (req, res) => res.redirect('/admin/'));

// 404
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(config.port, () => {
  console.log(`[Soluxa Chatbot] Serveur démarré sur http://localhost:${config.port}`);
  console.log(`[Soluxa Chatbot] Admin: http://localhost:${config.port}/admin/`);
});
