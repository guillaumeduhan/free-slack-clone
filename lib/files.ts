/** Uploads are stored in Postgres (chat.file_blobs), so keep them reasonably small. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
