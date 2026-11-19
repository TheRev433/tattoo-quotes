import fs from 'node:fs';
import path from 'node:path';
import { randomToken } from '../../lib/tokens.js';

const STORED_NAME = /^[A-Za-z0-9_-]{20,64}\.(jpg|png|webp|gif)$/;

/**
 * Stores uploaded files on disk under one folder with random, unguessable names.
 * The database keeps the metadata; this class only knows about bytes.
 */
export class FileStore {
  constructor(readonly dir: string) {}

  /** Writes the bytes and returns the generated file name (e.g. `Xy3...Q.png`). */
  save(bytes: Uint8Array, extension: string): string {
    fs.mkdirSync(this.dir, { recursive: true });
    const name = `img_${randomToken(18)}${extension}`;
    fs.writeFileSync(path.join(this.dir, name), bytes, { flag: 'wx' });
    return name;
  }

  /** Absolute path for a stored name, or null when the name is not one this store could have produced. */
  resolve(storedName: string): string | null {
    return STORED_NAME.test(storedName) ? path.join(this.dir, storedName) : null;
  }

  exists(storedName: string): boolean {
    const file = this.resolve(storedName);
    return file !== null && fs.existsSync(file);
  }

  remove(storedName: string): void {
    const file = this.resolve(storedName);
    if (file) fs.rmSync(file, { force: true });
  }
}
