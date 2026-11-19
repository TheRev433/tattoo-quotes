import { Router } from 'express';
import { tokenParam } from '../../http/schemas.js';
import { imagesUpload, uploadedFiles } from '../attachments/uploads.middleware.js';
import type { UploadLimits } from '../../config.js';
import type { MessagesService } from '../messages/messages.service.js';
import { createRequestSchema, messageSchema } from './requests.schemas.js';
import type { RequestsService } from './requests.service.js';

/** Public (client) endpoints. The random token in the URL is the client's only credential. */
export function requestsRouter(requests: RequestsService, messages: MessagesService, limits: UploadLimits): Router {
  const router = Router();
  const upload = imagesUpload(limits);

  router.post('/', upload, (req, res) => {
    const input = createRequestSchema.parse(req.body ?? {});
    const view = requests.create(input, uploadedFiles(req));
    res.status(201).location(`/api/requests/${view.publicToken}`).json(view);
  });

  router.get('/:token', (req, res) => {
    const { token } = tokenParam.parse(req.params);
    res.json(requests.getPublic(token));
  });

  router.post('/:token/messages', upload, (req, res) => {
    const { token } = tokenParam.parse(req.params);
    const input = messageSchema.parse(req.body ?? {});
    res.status(201).json(messages.addClientMessage(token, input, uploadedFiles(req)));
  });

  return router;
}
