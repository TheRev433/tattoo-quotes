import { execute, queryAll, queryOne, type Db } from '../../db/database.js';

export type Uploader = 'client' | 'artist';

export interface AttachmentRow {
  id: number;
  requestId: number;
  messageId: number | null;
  uploadedBy: Uploader;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface NewAttachment {
  requestId: number;
  messageId: number | null;
  uploadedBy: Uploader;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

const SELECT = `
  SELECT id, request_id AS requestId, message_id AS messageId, uploaded_by AS uploadedBy,
         original_name AS originalName, stored_name AS storedName, mime_type AS mimeType,
         size_bytes AS sizeBytes, created_at AS createdAt
  FROM attachments`;

export class AttachmentsRepository {
  constructor(private readonly db: Db) {}

  insert(a: NewAttachment): number {
    return execute(
      this.db,
      `INSERT INTO attachments (request_id, message_id, uploaded_by, original_name, stored_name, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      a.requestId,
      a.messageId,
      a.uploadedBy,
      a.originalName,
      a.storedName,
      a.mimeType,
      a.sizeBytes,
      a.createdAt,
    ).lastId;
  }

  listForRequest(requestId: number): AttachmentRow[] {
    return queryAll<AttachmentRow>(this.db, `${SELECT} WHERE request_id = ? ORDER BY id`, requestId);
  }

  findByStoredName(storedName: string): AttachmentRow | undefined {
    return queryOne<AttachmentRow>(this.db, `${SELECT} WHERE stored_name = ?`, storedName);
  }
}
