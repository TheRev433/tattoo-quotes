import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import type { Db } from './db/database.js';
import { errorHandler, notFound } from './http/errors.js';
import { artistsRouter } from './modules/artists/artists.routes.js';
import { uploadsRouter } from './modules/attachments/attachments.routes.js';
import { inboxRouter } from './modules/requests/inbox.routes.js';
import { metaRouter } from './modules/requests/meta.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';
import { createServices, type ServiceOptions } from './services.js';

export interface AppOptions extends ServiceOptions {
  /** When set and present on disk, the built Angular app is served from here. */
  webDist?: string;
}

export function createApp(db: Db, options: AppOptions = {}): Express {
  const services = createServices(db, options);
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/meta', metaRouter(services.limits));
  api.use('/artists', artistsRouter(services.artists));
  api.use('/requests', requestsRouter(services.requests, services.messages, services.limits));
  api.use('/inbox', inboxRouter(services.artists, services.requests, services.messages, services.limits));
  api.use('/uploads', uploadsRouter(services.attachments));
  api.use(() => {
    throw notFound('Route');
  });
  app.use('/api', api);

  if (options.webDist && fs.existsSync(path.join(options.webDist, 'index.html'))) {
    const index = path.join(options.webDist, 'index.html');
    app.use(express.static(options.webDist, { index: false }));
    // SPA fallback: any other GET renders the Angular shell (API 404s are handled above).
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(index) : next()));
  }

  app.use(errorHandler);
  return app;
}
