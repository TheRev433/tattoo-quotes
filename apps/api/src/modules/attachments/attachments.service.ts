import type { UploadLimits } from '../../config.js';
import { notFound } from '../../http/errors.js';
import type { AttachmentRow, AttachmentsRepository, Uploader } from './attachments.repository.js';
import type { FileStore } from './file-store.js';
import { validateImages, type IncomingFile, type ValidatedImage } from './upload-validation.js';

export interface Attachment {
  id: number;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: Uploader;
  createdAt: string;
}

export function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    url: `/api/uploads/${row.storedName}`,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

/** Images written to disk but not yet linked in the database. */
export interface StagedImages {
  images: (ValidatedImage & { storedName: string })[];
  /** Deletes the files again; call when the surrounding database work fails. */
  discard(): void;
}

export class AttachmentsService {
  constructor(
    private readonly repo: AttachmentsRepository,
    private readonly store: FileStore,
    readonly limits: UploadLimits,
  ) {}

  validate(files: readonly IncomingFile[], options: { min?: number } = {}): ValidatedImage[] {
    return validateImages(files, this.limits, options);
  }

  /** Writes validated images to the upload folder. */
  stage(images: readonly ValidatedImage[]): StagedImages {
    const staged: StagedImages['images'] = [];
    const discard = () => {
      for (const image of staged) this.store.remove(image.storedName);
    };
    try {
      for (const image of images) staged.push({ ...image, storedName: this.store.save(image.bytes, image.extension) });
    } catch (error) {
      discard();
      throw error;
    }
    return { images: staged, discard };
  }

  /** Inserts metadata rows for staged images. Call inside the caller's transaction. */
  link(
    staged: StagedImages,
    target: { requestId: number; messageId: number | null; uploadedBy: Uploader; createdAt: string },
  ): void {
    for (const image of staged.images) {
      this.repo.insert({
        ...target,
        originalName: image.originalName,
        storedName: image.storedName,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
      });
    }
  }

  listForRequest(requestId: number): AttachmentRow[] {
    return this.repo.listForRequest(requestId);
  }

  /** Metadata and absolute path for serving a stored file. */
  file(storedName: string): { row: AttachmentRow; path: string } {
    const path = this.store.resolve(storedName);
    const row = path ? this.repo.findByStoredName(storedName) : undefined;
    if (!path || !row || !this.store.exists(storedName)) throw notFound('File');
    return { row, path };
  }
}
