import { config, type UploadLimits } from './config.js';
import type { Db } from './db/database.js';
import { systemClock, type Clock } from './lib/clock.js';
import { ArtistsRepository } from './modules/artists/artists.repository.js';
import { ArtistsService } from './modules/artists/artists.service.js';
import { AttachmentsRepository } from './modules/attachments/attachments.repository.js';
import { AttachmentsService } from './modules/attachments/attachments.service.js';
import { FileStore } from './modules/attachments/file-store.js';
import { MessagesRepository } from './modules/messages/messages.repository.js';
import { MessagesService } from './modules/messages/messages.service.js';
import { QuotesRepository } from './modules/quotes/quotes.repository.js';
import { RequestsRepository } from './modules/requests/requests.repository.js';
import { RequestsService } from './modules/requests/requests.service.js';

export interface ServiceOptions {
  /** Folder for uploaded images. Defaults to `config.uploadsDir`. */
  uploadsDir?: string;
  uploadLimits?: UploadLimits;
  clock?: Clock;
}

/** Composition root: wires repositories into services for one database handle. */
export function createServices(db: Db, options: ServiceOptions = {}) {
  const clock = options.clock ?? systemClock;
  const limits = options.uploadLimits ?? config.uploads;
  const requestsRepo = new RequestsRepository(db);
  const messagesRepo = new MessagesRepository(db);
  const quotesRepo = new QuotesRepository(db);
  const artists = new ArtistsService(new ArtistsRepository(db));
  const attachments = new AttachmentsService(
    new AttachmentsRepository(db),
    new FileStore(options.uploadsDir ?? config.uploadsDir),
    limits,
  );
  const requests = new RequestsService(db, requestsRepo, messagesRepo, quotesRepo, attachments, artists, clock);
  const messages = new MessagesService(db, requests, requestsRepo, messagesRepo, quotesRepo, attachments, clock);
  return { artists, attachments, requests, messages, limits };
}

export type Services = ReturnType<typeof createServices>;
