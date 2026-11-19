import { Router, type RequestHandler } from 'express';
import type { Artist } from './artists.repository.js';
import type { ArtistsService } from './artists.service.js';

export function artistsRouter(service: ArtistsService): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(service.list());
  });
  return router;
}

/** Express middleware: requires a valid `X-Artist-Id` header and stores the artist on `res.locals`. */
export function requireArtist(service: ArtistsService): RequestHandler {
  return (req, res, next) => {
    res.locals['artist'] = service.authenticate(req.get('x-artist-id'));
    next();
  };
}

export function currentArtist(res: { locals: Record<string, unknown> }): Artist {
  return res.locals['artist'] as Artist;
}
