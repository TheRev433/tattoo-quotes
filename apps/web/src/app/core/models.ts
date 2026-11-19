export type RequestStatus = 'new' | 'in_review' | 'quoted' | 'accepted' | 'declined';
export type ColorMode = 'color' | 'black_grey';
export type PriceType = 'fixed' | 'range';

export interface Option {
  value: string;
  label: string;
}

export interface Meta {
  styles: Option[];
  colorModes: Option[];
  placements: string[];
  statuses: { value: RequestStatus; label: string }[];
  priceTypes: PriceType[];
  currency: string;
  sizeCm: { min: number; max: number };
  uploads: { maxFileBytes: number; maxFiles: number; acceptedTypes: string[] };
}

export interface Artist {
  id: number;
  name: string;
  slug: string;
  bio: string;
  specialties: string[];
  active: boolean;
}

export interface ArtistRef {
  id: number;
  name: string;
}

export interface Attachment {
  id: number;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: 'client' | 'artist';
  createdAt: string;
}

export interface Quote {
  id: number;
  messageId: number;
  priceType: PriceType;
  amountMinCents: number;
  amountMaxCents: number;
  currency: string;
  estimatedSessions: number;
  estimatedHours: number;
  createdAt: string;
  artist: ArtistRef;
}

export interface ThreadMessage {
  id: number;
  authorType: 'client' | 'artist';
  authorName: string;
  artistId: number | null;
  body: string;
  createdAt: string;
  attachments: Attachment[];
  quote: Quote | null;
}

export interface PublicRequest {
  publicToken: string;
  clientName: string;
  clientEmail: string;
  description: string;
  placement: string;
  widthCm: number;
  heightCm: number;
  style: string;
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

export interface StatusEvent {
  id: number;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  artistId: number | null;
  artistName: string | null;
  note: string;
  createdAt: string;
}

export interface ArtistRequest extends PublicRequest {
  id: number;
  clientLink: string;
  statusHistory: StatusEvent[];
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
  style: string;
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

export type AssignedFilter = 'all' | 'me' | 'unassigned';

export interface InboxQuery {
  status?: RequestStatus;
  assigned?: AssignedFilter;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface InboxPage {
  items: InboxItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: Record<RequestStatus | 'all', number>;
}
