import { inTransaction, type Db } from '../../db/database.js';
import { conflict, validationError } from '../../http/errors.js';
import { isoNow, type Clock } from '../../lib/clock.js';
import type { Artist } from '../artists/artists.repository.js';
import type { AttachmentsService } from '../attachments/attachments.service.js';
import type { MessagesRepository } from './messages.repository.js';
import type { IncomingFile } from '../attachments/upload-validation.js';
import { parseQuoteFields } from '../quotes/quote.js';
import type { QuotesRepository } from '../quotes/quotes.repository.js';
import { canMessage, canQuote, STATUS_LABELS } from '../requests/request-status.js';
import type { RequestsRepository } from '../requests/requests.repository.js';
import type { ArtistReplyInput } from '../requests/requests.schemas.js';
import type { ArtistRequestView, PublicRequestView, RequestsService } from '../requests/requests.service.js';

/**
 * The conversation on a request: client messages through the private link and
 * artist replies, which may carry extra reference images and a price.
 */
export class MessagesService {
  constructor(
    private readonly db: Db,
    private readonly requests: RequestsService,
    private readonly requestsRepo: RequestsRepository,
    private readonly messages: MessagesRepository,
    private readonly quotes: QuotesRepository,
    private readonly attachments: AttachmentsService,
    private readonly clock: Clock,
  ) {}

  addClientMessage(token: string, input: { body: string }, files: readonly IncomingFile[]): PublicRequestView {
    const row = this.requests.findByToken(token);
    if (!canMessage(row.status)) throw conflict(`This request is ${STATUS_LABELS[row.status].toLowerCase()}; messages are closed`);
    const staged = this.attachments.stage(this.attachments.validate(files));
    try {
      inTransaction(this.db, () => {
        const now = isoNow(this.clock);
        const messageId = this.messages.insert({ requestId: row.id, authorType: 'client', artistId: null, body: input.body, createdAt: now });
        this.attachments.link(staged, { requestId: row.id, messageId, uploadedBy: 'client', createdAt: now });
        this.requestsRepo.touch(row.id, now);
      });
    } catch (error) {
      staged.discard();
      throw error;
    }
    return this.requests.getPublic(token);
  }

  /**
   * Artist reply. Replying to a `new` request moves it to `in_review` and assigns it
   * to the artist. Including a price creates the quote and moves it to `quoted`.
   */
  addArtistReply(requestId: number, artist: Artist, input: ArtistReplyInput, files: readonly IncomingFile[]): ArtistRequestView {
    const row = this.requests.findById(requestId);
    this.requests.assertCanAct(row, artist);
    if (!canMessage(row.status)) throw conflict(`This request is ${STATUS_LABELS[row.status].toLowerCase()}; messages are closed`);

    const parsed = parseQuoteFields(input);
    if (!parsed.ok) throw validationError(parsed.issues);
    const terms = parsed.terms;
    if (terms && !canQuote(row.status)) {
      throw conflict(
        row.status === 'quoted'
          ? 'This request already has a quote'
          : `A price can only be sent while the request is new or in review (it is ${STATUS_LABELS[row.status].toLowerCase()})`,
      );
    }

    const staged = this.attachments.stage(this.attachments.validate(files));
    try {
      inTransaction(this.db, () => {
        if (row.status === 'new') this.requests.applyTransition(row, artist, 'in_review');
        const now = isoNow(this.clock);
        const messageId = this.messages.insert({ requestId: row.id, authorType: 'artist', artistId: artist.id, body: input.body, createdAt: now });
        this.attachments.link(staged, { requestId: row.id, messageId, uploadedBy: 'artist', createdAt: now });
        if (terms) {
          this.quotes.insert({ requestId: row.id, messageId, artistId: artist.id, ...terms, createdAt: now });
          this.requests.applyTransition(row, artist, 'quoted');
        }
        this.requestsRepo.touch(row.id, now);
      });
    } catch (error) {
      staged.discard();
      throw error;
    }
    return this.requests.getForArtist(requestId);
  }
}
