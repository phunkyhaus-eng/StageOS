-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('DRUMS', 'BASS', 'GUITAR', 'VOCALS', 'SOUND', 'KEYS', 'PERCUSSION', 'OTHER');

-- CreateEnum
CREATE TYPE "OfferPolicy" AS ENUM ('CASCADE');

-- CreateEnum
CREATE TYPE "GigRoleRequirementStatus" AS ENUM ('UNFILLED', 'OFFERING', 'FILLED');

-- CreateEnum
CREATE TYPE "GigRoleAssignmentStatus" AS ENUM ('OFFERED', 'CONFIRMED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OfferResponse" AS ENUM ('YES', 'NO');

-- CreateTable
CREATE TABLE "Person" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "bandId" TEXT NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "status" "PersonStatus" NOT NULL DEFAULT 'ACTIVE',
  "roles" "StaffRole"[],
  "emailVerifiedAt" TIMESTAMP(3),
  "availabilityPrefs" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GigRoleRequirement" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "bandId" TEXT NOT NULL,
  "gigId" TEXT NOT NULL,
  "role" "StaffRole" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "offerPolicy" "OfferPolicy" NOT NULL DEFAULT 'CASCADE',
  "status" "GigRoleRequirementStatus" NOT NULL DEFAULT 'UNFILLED',
  "offersPaused" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "GigRoleRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GigRoleRankList" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "bandId" TEXT NOT NULL,
  "requirementId" TEXT,
  "templateName" TEXT,
  "role" "StaffRole" NOT NULL,
  "rank" INTEGER NOT NULL,
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "GigRoleRankList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GigRoleAssignment" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "bandId" TEXT NOT NULL,
  "gigId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "role" "StaffRole" NOT NULL,
  "personId" TEXT NOT NULL,
  "attemptId" TEXT,
  "assignmentStatus" "GigRoleAssignmentStatus" NOT NULL,
  "conflictWarning" TEXT,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "GigRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferAttempt" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "bandId" TEXT NOT NULL,
  "gigId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "role" "StaffRole" NOT NULL,
  "personId" TEXT NOT NULL,
  "attemptNo" INTEGER NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "response" "OfferResponse",
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "correlationToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OfferAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonEmailToken" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PersonEmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_bandId_email_key" ON "Person"("bandId", "email");
CREATE INDEX "Person_organisationId_bandId_status_idx" ON "Person"("organisationId", "bandId", "status");
CREATE INDEX "Person_userId_idx" ON "Person"("userId");
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GigRoleRequirement_gigId_role_key" ON "GigRoleRequirement"("gigId", "role");
CREATE INDEX "GigRoleRequirement_organisationId_bandId_status_idx" ON "GigRoleRequirement"("organisationId", "bandId", "status");
CREATE INDEX "GigRoleRequirement_deletedAt_idx" ON "GigRoleRequirement"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GigRoleRankList_requirementId_rank_key" ON "GigRoleRankList"("requirementId", "rank");
CREATE INDEX "GigRoleRankList_organisationId_bandId_role_templateName_idx" ON "GigRoleRankList"("organisationId", "bandId", "role", "templateName");
CREATE INDEX "GigRoleRankList_personId_idx" ON "GigRoleRankList"("personId");
CREATE INDEX "GigRoleRankList_deletedAt_idx" ON "GigRoleRankList"("deletedAt");

-- CreateIndex
CREATE INDEX "GigRoleAssignment_organisationId_bandId_gigId_role_assignmentStatus_idx" ON "GigRoleAssignment"("organisationId", "bandId", "gigId", "role", "assignmentStatus");
CREATE INDEX "GigRoleAssignment_requirementId_assignmentStatus_idx" ON "GigRoleAssignment"("requirementId", "assignmentStatus");
CREATE INDEX "GigRoleAssignment_personId_assignmentStatus_idx" ON "GigRoleAssignment"("personId", "assignmentStatus");
CREATE INDEX "GigRoleAssignment_deletedAt_idx" ON "GigRoleAssignment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfferAttempt_correlationToken_key" ON "OfferAttempt"("correlationToken");
CREATE UNIQUE INDEX "OfferAttempt_requirementId_attemptNo_key" ON "OfferAttempt"("requirementId", "attemptNo");
CREATE INDEX "OfferAttempt_organisationId_bandId_role_expiresAt_idx" ON "OfferAttempt"("organisationId", "bandId", "role", "expiresAt");
CREATE INDEX "OfferAttempt_requirementId_respondedAt_idx" ON "OfferAttempt"("requirementId", "respondedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonEmailToken_tokenHash_key" ON "PersonEmailToken"("tokenHash");
CREATE INDEX "PersonEmailToken_personId_expiresAt_idx" ON "PersonEmailToken"("personId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GigRoleRequirement" ADD CONSTRAINT "GigRoleRequirement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleRequirement" ADD CONSTRAINT "GigRoleRequirement_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleRequirement" ADD CONSTRAINT "GigRoleRequirement_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GigRoleRankList" ADD CONSTRAINT "GigRoleRankList_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleRankList" ADD CONSTRAINT "GigRoleRankList_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleRankList" ADD CONSTRAINT "GigRoleRankList_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "GigRoleRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleRankList" ADD CONSTRAINT "GigRoleRankList_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GigRoleAssignment" ADD CONSTRAINT "GigRoleAssignment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleAssignment" ADD CONSTRAINT "GigRoleAssignment_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleAssignment" ADD CONSTRAINT "GigRoleAssignment_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleAssignment" ADD CONSTRAINT "GigRoleAssignment_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "GigRoleRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleAssignment" ADD CONSTRAINT "GigRoleAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigRoleAssignment" ADD CONSTRAINT "GigRoleAssignment_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "OfferAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OfferAttempt" ADD CONSTRAINT "OfferAttempt_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferAttempt" ADD CONSTRAINT "OfferAttempt_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "Band"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferAttempt" ADD CONSTRAINT "OfferAttempt_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferAttempt" ADD CONSTRAINT "OfferAttempt_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "GigRoleRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferAttempt" ADD CONSTRAINT "OfferAttempt_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonEmailToken" ADD CONSTRAINT "PersonEmailToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
