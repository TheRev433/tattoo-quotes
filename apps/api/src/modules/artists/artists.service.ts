import { conflict, notFound, unauthorized } from '../../http/errors.js';
import type { Artist, ArtistsRepository } from './artists.repository.js';

export interface CreateArtistInput {
  name: string;
  bio?: string;
  specialties?: string[];
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class ArtistsService {
  constructor(private readonly repo: ArtistsRepository) {}

  list(): Artist[] {
    return this.repo.list();
  }

  get(id: number): Artist {
    const artist = this.repo.findById(id);
    if (!artist) throw notFound('Artist');
    return artist;
  }

  /** An active artist for a preferred-artist choice, or a 400-style lookup failure. */
  findActive(id: number): Artist | undefined {
    const artist = this.repo.findById(id);
    return artist?.active ? artist : undefined;
  }

  /**
   * Resolves the acting artist from the `X-Artist-Id` header value.
   * v1 has no passwords: the web app lets you pick who you are (see README).
   */
  authenticate(headerValue: string | undefined): Artist {
    const id = Number(headerValue);
    if (!headerValue || !Number.isInteger(id) || id <= 0) {
      throw unauthorized('Pick an artist first (missing X-Artist-Id header)');
    }
    const artist = this.repo.findById(id);
    if (!artist || !artist.active) throw unauthorized('Unknown or inactive artist');
    return artist;
  }

  create(input: CreateArtistInput): Artist {
    const slug = slugify(input.name);
    if (this.repo.list(true).some((a) => a.slug === slug)) throw conflict(`An artist named "${input.name}" already exists`);
    return this.get(this.repo.insert({ name: input.name, slug, bio: input.bio ?? '', specialties: input.specialties ?? [] }));
  }
}
