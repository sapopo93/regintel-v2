// Placeholder PrismaStore - uses InMemoryStore for MVP
// TODO: Implement real Prisma-based persistence

import { InMemoryStore, type TenantContext } from './store';

export class PrismaStore extends InMemoryStore {
  constructor() {
    super();
    console.log('[PrismaStore] Using in-memory storage (Prisma not yet implemented)');
  }
}
