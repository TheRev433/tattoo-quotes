import { Router } from 'express';
import type { UploadLimits } from '../../config.js';
import { idParam } from '../../http/schemas.js';
import { currentArtist, requireArtist } from '../artists/artists.routes.js';
import type { ArtistsService } from '../artists/artists.service.js';
import { imagesUpload, uploadedFiles } from '../attachments/uploads.middleware.js';
import type { MessagesService } from '../messages/messages.service.js';
import { artistReplySchema, changeStatusSchema, inboxQuerySchema } from './requests.schemas.js';
import type { RequestsService } from './requests.service.js';

/** Artist endpoints. Every route needs the `X-Artist-Id` header. */
export function inboxRouter(
  artists: ArtistsService,
  requests: RequestsService,
  messages: MessagesService,
  limits: UploadLimits,
): Router {
  const router = Router();
  router.use(requireArtist(artists));

  router.get('/me', (_req, res) => {
    res.json(currentArtist(res));
  });

  router.get('/requests', (req, res) => {
    res.json(requests.inbox(currentArtist(res), inboxQuerySchema.parse(req.query)));
  });

  router.get('/requests/:id', (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(requests.getForArtist(id));
  });

  router.post('/requests/:id/status', (req, res) => {
    const { id } = idParam.parse(req.params);
    const { status, note } = changeStatusSchema.parse(req.body ?? {});
    res.json(requests.changeStatus(id, currentArtist(res), status, note));
  });

  router.post('/requests/:id/replies', imagesUpload(limits), (req, res) => {
    const { id } = idParam.parse(req.params);
    const input = artistReplySchema.parse(req.body ?? {});
    res.status(201).json(messages.addArtistReply(id, currentArtist(res), input, uploadedFiles(req)));
  });

  return router;
}
