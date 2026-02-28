/**
 * Clerk Webhook Handler
 *
 * Processes Clerk authentication events and logs them to the audit chain.
 * Webhooks are verified using Svix for security.
 */

import type { Request, Response } from 'express';
import { Webhook } from 'svix';
import { InMemoryStore } from '../store';

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET || '';

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    object: string;
    created_at: number;
    updated_at: number;
    // User fields
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string;
    last_name?: string;
    // Session fields
    user_id?: string;
    status?: string;
    // Organization fields
    organization_id?: string;
  };
}

/**
 * Handle incoming Clerk webhooks
 */
export async function handleClerkWebhook(
  req: Request,
  res: Response,
  store: InMemoryStore
): Promise<void> {
  // Verify webhook signature
  const payload = JSON.stringify(req.body);
  const headers = {
    'svix-id': req.header('svix-id') || '',
    'svix-timestamp': req.header('svix-timestamp') || '',
    'svix-signature': req.header('svix-signature') || '',
  };

  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(webhookSecret);
    event = wh.verify(payload, headers) as ClerkWebhookEvent;
  } catch (error) {
    console.error('Webhook verification failed:', error);
    res.status(400).json({ error: 'Invalid webhook signature' });
    return;
  }

  // Extract tenant ID from event data
  const tenantId = event.data.organization_id || event.data.id;
  const ctx = { tenantId, actorId: 'SYSTEM' };

  try {
    // Log auth events to audit chain
    switch (event.type) {
      case 'user.created':
        store.appendAuditEvent(ctx, tenantId, 'USER_CREATED', {
          userId: event.data.id,
          email: event.data.email_addresses?.[0]?.email_address,
          firstName: event.data.first_name,
          lastName: event.data.last_name,
          timestamp: new Date(event.data.created_at).toISOString(),
        });
        break;

      case 'user.updated':
        store.appendAuditEvent(ctx, tenantId, 'USER_UPDATED', {
          userId: event.data.id,
          email: event.data.email_addresses?.[0]?.email_address,
          timestamp: new Date(event.data.updated_at).toISOString(),
        });
        break;

      case 'user.deleted':
        store.appendAuditEvent(ctx, tenantId, 'USER_DELETED', {
          userId: event.data.id,
          timestamp: new Date(event.data.updated_at).toISOString(),
        });
        break;

      case 'session.created':
        store.appendAuditEvent(ctx, tenantId, 'SESSION_STARTED', {
          userId: event.data.user_id,
          sessionId: event.data.id,
          timestamp: new Date(event.data.created_at).toISOString(),
        });
        break;

      case 'session.ended':
        store.appendAuditEvent(ctx, tenantId, 'SESSION_ENDED', {
          userId: event.data.user_id,
          sessionId: event.data.id,
          status: event.data.status,
          timestamp: new Date(event.data.updated_at).toISOString(),
        });
        break;

      case 'session.removed':
        store.appendAuditEvent(ctx, tenantId, 'SESSION_REMOVED', {
          userId: event.data.user_id,
          sessionId: event.data.id,
          timestamp: new Date(event.data.updated_at).toISOString(),
        });
        break;

      case 'session.revoked':
        store.appendAuditEvent(ctx, tenantId, 'SESSION_REVOKED', {
          userId: event.data.user_id,
          sessionId: event.data.id,
          timestamp: new Date(event.data.updated_at).toISOString(),
        });
        break;

      default:
        // Log unknown event types for debugging
        console.log(`Unhandled Clerk webhook event: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing Clerk webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}
