export class StorageNotFoundError extends Error {
  constructor(contentHash: string) {
    super(`Blob not found: ${contentHash}`);
    this.name = 'StorageNotFoundError';
  }
}
