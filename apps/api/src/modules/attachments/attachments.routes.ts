import { Router } from 'express';
import type { AttachmentsService } from './attachments.service.js';

/**
 * Serves uploaded images. The random 24-character file name acts as the
 * capability: whoever can see a request (client link or artist inbox) gets the URLs.
 */
export function uploadsRouter(service: AttachmentsService): Router {
  const router = Router();
  router.get('/:storedName', (req, res) => {
    const { row, path } = service.file(req.params.storedName);
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.originalName)}`);
    res.sendFile(path);
  });
  return router;
}
