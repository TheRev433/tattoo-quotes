import { inTransaction, type Db } from '../../db/database.js';
import { badRequest, forbidden, notFound } from '../../http/errors.js';
import { isoNow, type Clock } from '../../lib/clock.js';
import { randomToken } from '../../lib/tokens.js';
import type { Artist } from '../artists/artists.repository.js';
import type { ArtistsService } from '../artists/artists.service.js';
import { toAttachment, type Attachment, type AttachmentsService } from '../attachments/attachments.service.js';
import type { IncomingFile } from '../attachments/upload-validation.js';
import type { MessagesRepository } from '../messages/messages.repository.js';
import type { QuoteRow, QuotesRepository } from '../quotes/quotes.repository.js';
import { DEFAULT_CURRENCY, type ColorMode, type TattooStyle } from './catalog.js';
import {
  assertManualTransition,
  assertTransition,
  canMessage,
  canQuote,
  manualTransitions,
  type RequestStatus,
} from './request-status.js';
import type { CreateRequestInput, InboxQuery } from './requests.schemas.js';
import type { InboxRow, QuoteRequestRow, RequestsRepository, StatusEventRow } from './requests.repository.js';

export interface ArtistRef {
  id: number;
  name: string;
}

export type Quote = Omit<QuoteRow, 'requestId' | 'artistName' | 'artistId'> & { artist: ArtistRef };

export interface ThreadMessage {
  id: number;
  authorType: 'client' | 'artist';
  authorName: string;
  artistId: number | null;
  body: string;
  createdAt: string;
  attachments: Attachment[];
  /** Set on the artist reply that carried the price. */
  quote: Quote | null;
}

/** What the client sees through their private link. */
export interface PublicRequestView {
  publicToken: string;
  clientName: string;
  clientEmail: string;
  description: string;
  placement: string;
  widthCm: number;
  heightCm: number;
  style: TattooStyle;
  colorMode: ColorMode;
  availabilityNotes: string;
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  currency: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  preferredArtist: ArtistRef | null;
  assignedArtist: ArtistRef | null;
  images: Attachment[];
  messages: ThreadMessage[];
  quote: Quote | null;
  canMessage: boolean;
}

/** What artists see in the inbox detail. */
export interface ArtistRequestView extends PublicRequestView {
  id: number;
  clientLink: string;
  statusHistory: StatusEventRow[];
  allowedTransitions: RequestStatus[];
  canQuote: boolean;
}

export interface InboxItem {
  id: number;
  clientName: string;
  summary: string;
  placement: string;
  widthCm: number;
  heightCm: number;
  style: TattooStyle;
  colorMode: ColorMode;
  status: RequestStatus;
  createdAt: string;
  lastActivityAt: string;
  assignedArtist: ArtistRef | null;
  preferredArtist: ArtistRef | null;
  imageCount: number;
  messageCount: number;
  thumbnailUrl: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: Record<RequestStatus | 'all', number>;
}

const ref = (id: number | null, name: string | null): ArtistRef | null =>
  id !== null && name !== null ? { id, name } : null;

function toQuote(row: QuoteRow): Quote {
  const { requestId: _r, artistName, artistId, ...rest } = row;
  return { ...rest, artist: { id: artistId, name: artistName } };
}

function toInboxItem(r: InboxRow): InboxItem {
  return {
    id: r.id,
    clientName: r.clientName,
    summary: r.description.length > 140 ? `${r.description.slice(0, 137)}...` : r.description,
    placement: r.placement,
    widthCm: r.widthCm,
    heightCm: r.heightCm,
    style: r.style,
    colorMode: r.colorMode,
    status: r.status,
    createdAt: r.createdAt,
    lastActivityAt: r.lastActivityAt,
    assignedArtist: ref(r.assignedArtistId, r.assignedArtistName),
    preferredArtist: ref(r.preferredArtistId, r.preferredArtistName),
    imageCount: r.imageCount,
    messageCount: r.messageCount,
    thumbnailUrl: r.thumbnailStoredName ? `/api/uploads/${r.thumbnailStoredName}` : null,
  };
}

/**
 * Quote requests: creation from the public form, the client's private view,
 * the artist inbox, and status changes (all transitions validated by request-status.ts).
 */
export class RequestsService {
  constructor(
    private readonly db: Db,
    private readonly repo: RequestsRepository,
    private readonly messages: MessagesRepository,
    private readonly quotes: QuotesRepository,
    private readonly attachments: AttachmentsService,
    private readonly artists: ArtistsService,
    private readonly clock: Clock,
  ) {}

  /** Validates images, stores them, then creates the request in one transaction. */
  create(input: CreateRequestInput, files: readonly IncomingFile[]): PublicRequestView {
    if (input.preferredArtistId !== undefined && !this.artists.findActive(input.preferredArtistId)) {
      throw badRequest('Preferred artist not found', [{ path: 'preferredArtistId', message: 'Unknown artist' }]);
    }
    const images = this.attachments.validate(files, { min: 1 });
    const staged = this.attachments.stage(images);
    try {
      const token = inTransaction(this.db, () => {
        const now = isoNow(this.clock);
        const publicToken = randomToken();
        const id = this.repo.insert({
          publicToken,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          description: input.description,
          placement: input.placement,
          widthCm: input.widthCm,
          heightCm: input.heightCm,
          style: input.style,
          colorMode: input.colorMode,
          availabilityNotes: input.availabilityNotes,
          budgetMinCents: input.budgetMinCents ?? null,
          budgetMaxCents: input.budgetMaxCents ?? null,
          currency: DEFAULT_CURRENCY,
          preferredArtistId: input.preferredArtistId ?? null,
          createdAt: now,
        });
        this.repo.addStatusEvent({ requestId: id, fromStatus: null, toStatus: 'new', artistId: null, note: '', createdAt: now });
        this.attachments.link(staged, { requestId: id, messageId: null, uploadedBy: 'client', createdAt: now });
        return publicToken;
      });
      return this.getPublic(token);
    } catch (error) {
      staged.discard();
      throw error;
    }
  }

  findByToken(token: string): QuoteRequestRow {
    const row = this.repo.findByToken(token);
    if (!row) throw notFound('Quote request');
    return row;
  }

  findById(id: number): QuoteRequestRow {
    const row = this.repo.findById(id);
    if (!row) throw notFound('Quote request');
    return row;
  }

  getPublic(token: string): PublicRequestView {
    return this.buildPublicView(this.findByToken(token));
  }

  getForArtist(id: number): ArtistRequestView {
    const row = this.findById(id);
    return {
      id: row.id,
      ...this.buildPublicView(row),
      clientLink: `/r/${row.publicToken}`,
      statusHistory: this.repo.statusEvents(row.id),
      allowedTransitions: manualTransitions(row.status),
      canQuote: canQuote(row.status),
    };
  }

  inbox(artist: Artist, query: InboxQuery): InboxPage {
    const filter = { assigned: query.assigned, artistId: artist.id, q: query.q || undefined };
    const { rows, total } = this.repo.inbox({
      ...filter,
      status: query.status,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    const raw = this.repo.statusCounts(filter);
    const counts = {
      all: Object.values(raw).reduce((a, b) => a + b, 0),
      new: raw['new'] ?? 0,
      in_review: raw['in_review'] ?? 0,
      quoted: raw['quoted'] ?? 0,
      accepted: raw['accepted'] ?? 0,
      declined: raw['declined'] ?? 0,
    };
    return {
      items: rows.map(toInboxItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
      counts,
    };
  }

  /** Status change requested from the artist UI (buttons). `quoted` needs a reply with a price instead. */
  changeStatus(id: number, artist: Artist, to: RequestStatus, note = ''): ArtistRequestView {
    inTransaction(this.db, () => {
      const row = this.findById(id);
      this.assertCanAct(row, artist);
      assertManualTransition(row.status, to);
      this.applyTransition(row, artist, to, note);
    });
    return this.getForArtist(id);
  }

  /**
   * Throws 403 when another artist already owns the request.
   * Unassigned requests can be picked up by anyone.
   */
  assertCanAct(row: QuoteRequestRow, artist: Artist): void {
    if (row.assignedArtistId !== null && row.assignedArtistId !== artist.id) {
      const owner = this.artists.findActive(row.assignedArtistId)?.name ?? 'another artist';
      throw forbidden(`This request is assigned to ${owner}`);
    }
  }

  /**
   * Moves a request to `to`, logs a status event and assigns it to the acting artist
   * if nobody owns it yet. Must run inside a transaction. Returns the new status.
   */
  applyTransition(row: QuoteRequestRow, artist: Artist | null, to: RequestStatus, note = ''): RequestStatus {
    assertTransition(row.status, to);
    const now = isoNow(this.clock);
    if (artist && row.assignedArtistId === null) {
      this.repo.assign(row.id, artist.id, now);
      row.assignedArtistId = artist.id;
    }
    this.repo.setStatus(row.id, to, now);
    this.repo.addStatusEvent({
      requestId: row.id,
      fromStatus: row.status,
      toStatus: to,
      artistId: artist?.id ?? null,
      note,
      createdAt: now,
    });
    row.status = to;
    return to;
  }

  private buildPublicView(row: QuoteRequestRow): PublicRequestView {
    const attachments = this.attachments.listForRequest(row.id);
    const quoteRow = this.quotes.findForRequest(row.id);
    const quote = quoteRow ? toQuote(quoteRow) : null;
    const messages: ThreadMessage[] = this.messages.listForRequest(row.id).map((m) => ({
      id: m.id,
      authorType: m.authorType,
      authorName: m.authorType === 'client' ? row.clientName : (m.artistName ?? 'Artist'),
      artistId: m.artistId,
      body: m.body,
      createdAt: m.createdAt,
      attachments: attachments.filter((a) => a.messageId === m.id).map(toAttachment),
      quote: quote && quote.messageId === m.id ? quote : null,
    }));
    const preferred = row.preferredArtistId !== null ? this.artists.findActive(row.preferredArtistId) : undefined;
    const assigned = row.assignedArtistId !== null ? this.artists.findActive(row.assignedArtistId) : undefined;
    return {
      publicToken: row.publicToken,
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      description: row.description,
      placement: row.placement,
      widthCm: row.widthCm,
      heightCm: row.heightCm,
      style: row.style,
      colorMode: row.colorMode,
      availabilityNotes: row.availabilityNotes,
      budgetMinCents: row.budgetMinCents,
      budgetMaxCents: row.budgetMaxCents,
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      preferredArtist: preferred ? { id: preferred.id, name: preferred.name } : null,
      assignedArtist: assigned ? { id: assigned.id, name: assigned.name } : null,
      images: attachments.filter((a) => a.messageId === null).map(toAttachment),
      messages,
      quote,
      canMessage: canMessage(row.status),
    };
  }
}
