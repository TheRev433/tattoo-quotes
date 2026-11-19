import { execute, queryAll, queryOne, type Db } from '../../db/database.js';

export interface Artist {
  id: number;
  name: string;
  slug: string;
  bio: string;
  specialties: string[];
  active: boolean;
}

interface ArtistRow {
  id: number;
  name: string;
  slug: string;
  bio: string;
  specialties: string;
  active: number;
}

const SELECT = 'SELECT id, name, slug, bio, specialties, active FROM artists';

const toArtist = (r: ArtistRow): Artist => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  bio: r.bio,
  specialties: r.specialties ? r.specialties.split(',') : [],
  active: r.active === 1,
});

export class ArtistsRepository {
  constructor(private readonly db: Db) {}

  list(includeInactive = false): Artist[] {
    const where = includeInactive ? '' : ' WHERE active = 1';
    return queryAll<ArtistRow>(this.db, `${SELECT}${where} ORDER BY name COLLATE NOCASE`).map(toArtist);
  }

  findById(id: number): Artist | undefined {
    const row = queryOne<ArtistRow>(this.db, `${SELECT} WHERE id = ?`, id);
    return row ? toArtist(row) : undefined;
  }

  insert(a: { name: string; slug: string; bio: string; specialties: string[] }): number {
    return execute(
      this.db,
      'INSERT INTO artists (name, slug, bio, specialties) VALUES (?, ?, ?, ?)',
      a.name,
      a.slug,
      a.bio,
      a.specialties.join(','),
    ).lastId;
  }
}
