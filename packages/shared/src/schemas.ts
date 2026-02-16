import { z } from 'zod';

export const leadStageSchema = z.enum([
  'LEAD',
  'CONTACTED',
  'NEGOTIATING',
  'CONFIRMED',
  'CONTRACT_SENT',
  'PAID',
  'COMPLETED'
]);

export const eventTypeSchema = z.enum(['GIG', 'REHEARSAL', 'TRAVEL', 'OTHER']);
export const availabilityResponseSchema = z.enum(['YES', 'NO', 'MAYBE']);

export const roleNameSchema = z.enum(['OWNER', 'MANAGER', 'MEMBER', 'CREW', 'ACCOUNTANT']);

export const baseEntitySchema = z.object({
  id: z.string().uuid(),
  organisationId: z.string().uuid(),
  bandId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
  version: z.number().int().nonnegative()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  organisationName: z.string().min(2)
});

export const createEventSchema = z.object({
  bandId: z.string().uuid(),
  title: z.string().min(1),
  type: eventTypeSchema,
  status: z.string().default('PLANNED'),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venueName: z.string().optional(),
  address: z.string().optional(),
  mapUrl: z.string().url().optional(),
  notes: z.string().optional()
});

export const updateEventSchema = createEventSchema.partial().extend({
  id: z.string().uuid()
});

export const createLeadSchema = z.object({
  bandId: z.string().uuid(),
  name: z.string().min(1),
  stage: leadStageSchema.default('LEAD'),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  notes: z.string().optional()
});

export const setlistOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    clientOpId: z.string(),
    itemId: z.string().uuid(),
    afterItemId: z.string().uuid().nullable(),
    songVersionId: z.string().uuid(),
    notes: z.string().optional()
  }),
  z.object({
    op: z.literal('move'),
    clientOpId: z.string(),
    itemId: z.string().uuid(),
    afterItemId: z.string().uuid().nullable()
  }),
  z.object({
    op: z.literal('remove'),
    clientOpId: z.string(),
    itemId: z.string().uuid()
  }),
  z.object({
    op: z.literal('update'),
    clientOpId: z.string(),
    itemId: z.string().uuid(),
    notes: z.string().optional(),
    durationSec: z.number().int().positive().optional()
  })
]);

export const syncOperationSchema = z.object({
  entity: z.enum([
    'EVENT',
    'LEAD',
    'SETLIST',
    'SETLIST_ITEM',
    'INVOICE',
    'EXPENSE',
    'PAYOUT',
    'AVAILABILITY_RESPONSE'
  ]),
  operation: z.enum(['create', 'update', 'delete', 'setlistOps']),
  clientId: z.string(),
  entityId: z.string().uuid(),
  bandId: z.string().uuid(),
  baseVersion: z.number().int().nonnegative().optional(),
  payload: z.record(z.any()).optional(),
  setlistOps: z.array(setlistOperationSchema).optional(),
  updatedAt: z.string().datetime()
});

export const syncPushSchema = z.object({
  deviceId: z.string().uuid(),
  bandId: z.string().uuid(),
  operations: z.array(syncOperationSchema)
});

export const syncPullSchema = z.object({
  deviceId: z.string().uuid(),
  bandId: z.string().uuid(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().positive().max(1000).default(200)
});

export const apiKeyScopeSchema = z.enum([
  'read:events',
  'write:events',
  'read:finance',
  'write:finance',
  'read:files',
  'write:files',
  'read:setlists',
  'write:setlists',
  'read:analytics',
  'write:analytics',
  'read:tours',
  'write:tours'
]);

export const webhookEventSchema = z.enum([
  'event.created',
  'event.updated',
  'invoice.paid',
  'roster.locked',
  'file.uploaded'
]);

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(webhookEventSchema).min(1),
  secret: z.string().min(12)
});

export const prefetchSettingsSchema = z.object({
  upcomingEventCount: z.number().int().min(1).max(20)
});

export type LeadStage = z.infer<typeof leadStageSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type RoleName = z.infer<typeof roleNameSchema>;
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncPushInput = z.infer<typeof syncPushSchema>;
export type SyncPullInput = z.infer<typeof syncPullSchema>;
