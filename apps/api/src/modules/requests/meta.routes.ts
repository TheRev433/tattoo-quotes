import { Router } from 'express';
import type { UploadLimits } from '../../config.js';
import { IMAGE_EXTENSIONS } from '../../lib/image-sniff.js';
import { PRICE_TYPES } from '../quotes/quote.js';
import { COLOR_MODES, DEFAULT_CURRENCY, PLACEMENT_SUGGESTIONS, SIZE_LIMITS_CM, TATTOO_STYLES } from './catalog.js';
import { REQUEST_STATUSES, STATUS_LABELS } from './request-status.js';

/** Form options and limits, so the web app never hard-codes them. */
export function metaRouter(limits: UploadLimits): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      styles: Object.entries(TATTOO_STYLES).map(([value, label]) => ({ value, label })),
      colorModes: Object.entries(COLOR_MODES).map(([value, label]) => ({ value, label })),
      placements: PLACEMENT_SUGGESTIONS,
      statuses: REQUEST_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
      priceTypes: PRICE_TYPES,
      currency: DEFAULT_CURRENCY,
      sizeCm: SIZE_LIMITS_CM,
      uploads: {
        maxFileBytes: limits.maxFileBytes,
        maxFiles: limits.maxFiles,
        acceptedTypes: Object.keys(IMAGE_EXTENSIONS),
      },
    });
  });
  return router;
}
