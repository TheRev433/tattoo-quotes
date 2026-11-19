import fs from 'node:fs';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/database.js';

const db = openDatabase(config.dbPath);
const app = createApp(db, { webDist: config.webDist, uploadsDir: config.uploadsDir, uploadLimits: config.uploads });

const server = app.listen(config.port, config.host, () => {
  const base = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  console.log(`[api] listening on ${base}/api (database: ${config.dbPath}, uploads: ${config.uploadsDir})`);
  if (fs.existsSync(config.webDist)) console.log(`[api] serving built web app at ${base}/`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
