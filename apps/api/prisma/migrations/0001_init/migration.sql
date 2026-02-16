-- StageOS baseline migration.
-- This mirrors prisma/schema.prisma and is committed for deterministic environments.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE "RoleName" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'CREW', 'ACCOUNTANT');
CREATE TYPE "LeadStage" AS ENUM ('LEAD', 'CONTACTED', 'NEGOTIATING', 'CONFIRMED', 'CONTRACT_SENT', 'PAID', 'COMPLETED');
CREATE TYPE "EventType" AS ENUM ('GIG', 'REHEARSAL', 'TRAVEL', 'OTHER');
CREATE TYPE "EventStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AvailabilityStatus" AS ENUM ('PENDING', 'YES', 'NO', 'MAYBE');
CREATE TYPE "ItineraryType" AS ENUM ('TRAVEL', 'HOTEL', 'OTHER');
CREATE TYPE "PayoutType" AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TABLE "Organisation" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" TEXT NOT NULL,
  "retentionDays" INTEGER NOT NULL DEFAULT 90,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "calendarToken" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "Band" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT NULL,
  "calendarToken" TEXT NOT NULL UNIQUE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "BandMembership" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "roleName" "RoleName" NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL,
  UNIQUE("bandId", "userId")
);

CREATE TABLE "Role" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "name" "RoleName" NOT NULL,
  "description" TEXT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("organisationId", "name")
);

CREATE TABLE "Permission" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,
  "description" TEXT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("organisationId", "key")
);

CREATE TABLE "RolePermission" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "roleId" UUID NOT NULL REFERENCES "Role"("id") ON DELETE CASCADE,
  "permissionId" UUID NOT NULL REFERENCES "Permission"("id") ON DELETE CASCADE,
  UNIQUE("roleId", "permissionId")
);

CREATE TABLE "UserRole" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "roleId" UUID NOT NULL REFERENCES "Role"("id") ON DELETE CASCADE,
  UNIQUE("organisationId", "userId", "roleId")
);

CREATE TABLE "Contact" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NULL REFERENCES "Band"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NULL,
  "phone" TEXT NULL,
  "roleType" TEXT NULL,
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "Event" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "type" "EventType" NOT NULL,
  "status" "EventStatus" NOT NULL DEFAULT 'PLANNED',
  "startsAt" TIMESTAMP NOT NULL,
  "endsAt" TIMESTAMP NOT NULL,
  "venueName" TEXT NULL,
  "address" TEXT NULL,
  "mapUrl" TEXT NULL,
  "notes" TEXT NULL,
  "scheduleJson" JSONB NULL,
  "checklistJson" JSONB NULL,
  "rosterLocked" BOOLEAN NOT NULL DEFAULT FALSE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "EventContact" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "contactId" UUID NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  UNIQUE("eventId", "contactId", "kind")
);

CREATE TABLE "ScheduleBlock" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMP NOT NULL,
  "endsAt" TIMESTAMP NOT NULL,
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "EventTask" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT FALSE,
  "assignedUserId" UUID NULL REFERENCES "User"("id") ON DELETE SET NULL,
  "dueAt" TIMESTAMP NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "EventMessage" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "authorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Lead" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "stage" "LeadStage" NOT NULL DEFAULT 'LEAD',
  "contactName" TEXT NULL,
  "contactEmail" TEXT NULL,
  "expectedDate" TIMESTAMP NULL,
  "expectedFee" NUMERIC(12,2) NULL,
  "notes" TEXT NULL,
  "convertedEventId" UUID NULL REFERENCES "Event"("id") ON DELETE SET NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "LeadActivity" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "leadId" UUID NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
  "message" TEXT NOT NULL,
  "meta" JSONB NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Song" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "key" TEXT NULL,
  "bpm" INTEGER NULL,
  "durationSec" INTEGER NULL,
  "tags" TEXT[] NOT NULL,
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "SongVersion" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "songId" UUID NOT NULL REFERENCES "Song"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "arrangementKey" TEXT NULL,
  "notes" TEXT NULL,
  "chartAssetId" UUID NULL,
  "audioAssetId" UUID NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "Setlist" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "eventId" UUID NULL REFERENCES "Event"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "locked" BOOLEAN NOT NULL DEFAULT FALSE,
  "totalDurationSec" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "SetlistItem" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "setlistId" UUID NOT NULL REFERENCES "Setlist"("id") ON DELETE CASCADE,
  "songVersionId" UUID NOT NULL REFERENCES "SongVersion"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL,
  "notes" TEXT NULL,
  "durationSec" INTEGER NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "FileAsset" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NULL REFERENCES "Band"("id") ON DELETE SET NULL,
  "bucket" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "etag" TEXT NULL,
  "checksum" TEXT NULL,
  "availableOffline" BOOLEAN NOT NULL DEFAULT FALSE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL,
  UNIQUE("bucket", "objectKey")
);

CREATE TABLE "FileAssetLink" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NULL REFERENCES "Band"("id") ON DELETE SET NULL,
  "fileAssetId" UUID NOT NULL REFERENCES "FileAsset"("id") ON DELETE CASCADE,
  "eventId" UUID NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "leadId" UUID NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
  "songVersionId" UUID NULL REFERENCES "SongVersion"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Invoice" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "eventId" UUID NULL REFERENCES "Event"("id") ON DELETE SET NULL,
  "leadId" UUID NULL REFERENCES "Lead"("id") ON DELETE SET NULL,
  "invoiceNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "issuedAt" TIMESTAMP NULL,
  "dueAt" TIMESTAMP NULL,
  "paidAt" TIMESTAMP NULL,
  "subtotal" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "total" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL,
  UNIQUE("organisationId", "invoiceNumber")
);

CREATE TABLE "InvoiceLine" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "description" TEXT NOT NULL,
  "quantity" NUMERIC(10,2) NOT NULL DEFAULT 1,
  "unitPrice" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "lineTotal" NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE "Expense" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "eventId" UUID NULL REFERENCES "Event"("id") ON DELETE SET NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" NUMERIC(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "spentAt" TIMESTAMP NOT NULL,
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "Payout" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "eventId" UUID NULL REFERENCES "Event"("id") ON DELETE SET NULL,
  "userId" UUID NULL REFERENCES "User"("id") ON DELETE SET NULL,
  "type" "PayoutType" NOT NULL,
  "amount" NUMERIC(12,2) NULL,
  "percentage" NUMERIC(5,2) NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "Tour" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP NULL,
  "endsAt" TIMESTAMP NULL,
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "TourEvent" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tourId" UUID NOT NULL REFERENCES "Tour"("id") ON DELETE CASCADE,
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  UNIQUE("tourId", "eventId")
);

CREATE TABLE "ItineraryItem" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "tourId" UUID NOT NULL REFERENCES "Tour"("id") ON DELETE CASCADE,
  "eventId" UUID NULL REFERENCES "Event"("id") ON DELETE SET NULL,
  "type" "ItineraryType" NOT NULL,
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMP NOT NULL,
  "endsAt" TIMESTAMP NULL,
  "location" TEXT NULL,
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "AvailabilityRequest" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "eventId" UUID NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "targetGroup" TEXT NOT NULL,
  "notes" TEXT NULL,
  "closesAt" TIMESTAMP NULL,
  "lockedAt" TIMESTAMP NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "AvailabilityResponse" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "availabilityRequestId" UUID NOT NULL REFERENCES "AvailabilityRequest"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "response" "AvailabilityStatus" NOT NULL,
  "notes" TEXT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL,
  UNIQUE("availabilityRequestId", "userId")
);

CREATE TABLE "AuditLog" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "actorId" UUID NULL REFERENCES "User"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "diff" JSONB NULL,
  "metadata" JSONB NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "ApiKey" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL UNIQUE,
  "scopes" TEXT[] NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "lastUsedAt" TIMESTAMP NULL,
  "expiresAt" TIMESTAMP NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "WebhookEndpoint" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "url" TEXT NOT NULL,
  "events" TEXT[] NOT NULL,
  "secretHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP NULL
);

CREATE TABLE "WebhookDelivery" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "endpointId" UUID NOT NULL REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "signature" TEXT NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "responseStatus" INTEGER NULL,
  "responseBody" TEXT NULL,
  "nextAttemptAt" TIMESTAMP NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Device" (
  "id" UUID PRIMARY KEY,
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "platform" TEXT NOT NULL,
  "name" TEXT NULL,
  "lastSeenAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "SyncCursor" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "deviceId" UUID NOT NULL REFERENCES "Device"("id") ON DELETE CASCADE,
  "lastCursor" TEXT NULL,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("deviceId", "bandId")
);

CREATE TABLE "ChangeLog" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organisationId" UUID NOT NULL REFERENCES "Organisation"("id") ON DELETE CASCADE,
  "bandId" UUID NOT NULL REFERENCES "Band"("id") ON DELETE CASCADE,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "payload" JSONB NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "RefreshToken" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP NOT NULL,
  "revokedAt" TIMESTAMP NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX "Event_org_band_starts_idx" ON "Event"("organisationId", "bandId", "startsAt");
CREATE INDEX "Lead_org_band_stage_idx" ON "Lead"("organisationId", "bandId", "stage");
CREATE INDEX "ChangeLog_org_band_created_idx" ON "ChangeLog"("organisationId", "bandId", "createdAt");
CREATE INDEX "WebhookDelivery_org_status_idx" ON "WebhookDelivery"("organisationId", "status");
