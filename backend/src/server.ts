import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initWebSocketServer } from './services/websocket';
import repositoriesRouter from './routes/repositories';

dotenv.config();

// Dedicated default port 4890 for Auspex backend to avoid port collisions
const PORT = Number(process.env.PORT ?? 4890);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:4891';

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/repositories', repositoriesRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auspex-backend', port: PORT, timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────
const server = http.createServer(app);
initWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`🔭 Auspex backend running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}/ws`);
});

export default app;
