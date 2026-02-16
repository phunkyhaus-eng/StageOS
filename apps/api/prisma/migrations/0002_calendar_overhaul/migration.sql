-- Expand event taxonomy for hold/tentative and band-native event categories.
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'HOLD';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'PROMO';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'RECORDING';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'DEADLINE';

ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'HOLD';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'TENTATIVE';

-- Calendar UX support: all-day rendering and structured event metadata.
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "allDay" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "metadataJson" JSONB;
