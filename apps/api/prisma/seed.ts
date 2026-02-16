import { PrismaClient, LeadStage, RoleName, EventType, EventStatus, PayoutType, AvailabilityStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/api/.env'),
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../.env')
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

const prisma = new PrismaClient();
const DEMO_ORGANISATION_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_BAND_ID = '00000000-0000-0000-0000-000000000010';

const PERMISSIONS = [
  'read:events',
  'write:events',
  'read:finance',
  'write:finance',
  'read:files',
  'write:files',
  'read:setlists',
  'write:setlists',
  'read:availability',
  'write:availability',
  'read:crm',
  'write:crm',
  'read:tours',
  'write:tours',
  'read:analytics',
  'write:analytics',
  'manage:webhooks',
  'manage:api-keys',
  'manage:plugins',
  'manage:feature-flags'
];

const rolePerms: Record<RoleName, string[]> = {
  OWNER: PERMISSIONS,
  MANAGER: PERMISSIONS.filter((p) => p !== 'manage:api-keys'),
  MEMBER: ['read:events', 'read:files', 'read:setlists', 'read:availability', 'write:availability'],
  CREW: ['read:events', 'read:files', 'read:setlists', 'read:availability', 'write:availability'],
  ACCOUNTANT: ['read:finance', 'write:finance', 'read:events', 'read:files', 'read:analytics']
};

async function upsertRoleGraph(organisationId: string) {
  const permissionMap = new Map<string, string>();
  for (const key of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { organisationId_key: { organisationId, key } },
      update: {},
      create: { organisationId, key, description: key }
    });
    permissionMap.set(key, perm.id);
  }

  for (const roleName of Object.values(RoleName) as RoleName[]) {
    const role = await prisma.role.upsert({
      where: { organisationId_name: { organisationId, name: roleName } },
      update: {},
      create: { organisationId, name: roleName, description: `${roleName} role` }
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const key of rolePerms[roleName]) {
      const permissionId = permissionMap.get(key)!;
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } });
    }
  }
}

async function main() {
  // Keep local/dev seeding repeatable by clearing the fixed demo tenant first.
  await prisma.organisation.deleteMany({
    where: { id: DEMO_ORGANISATION_ID }
  });

  const passwordHash = await bcrypt.hash('Passw0rd!', 10);

  const organisation = await prisma.organisation.upsert({
    where: { id: DEMO_ORGANISATION_ID },
    update: { name: 'StageOS Demo Organisation' },
    create: {
      id: DEMO_ORGANISATION_ID,
      name: 'StageOS Demo Organisation',
      retentionDays: 90
    }
  });

  await upsertRoleGraph(organisation.id);

  const band = await prisma.band.upsert({
    where: { id: DEMO_BAND_ID },
    update: { name: 'The Stage Drivers' },
    create: {
      id: DEMO_BAND_ID,
      organisationId: organisation.id,
      name: 'The Stage Drivers',
      description: 'Touring demo band'
    }
  });

  const users = [
    { email: 'owner@stageos.local', name: 'Owner User', role: RoleName.OWNER },
    { email: 'manager@stageos.local', name: 'Manager User', role: RoleName.MANAGER },
    { email: 'member1@stageos.local', name: 'Member One', role: RoleName.MEMBER },
    { email: 'member2@stageos.local', name: 'Member Two', role: RoleName.MEMBER },
    { email: 'member3@stageos.local', name: 'Member Three', role: RoleName.MEMBER },
    { email: 'accountant@stageos.local', name: 'Accountant User', role: RoleName.ACCOUNTANT }
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash },
      create: {
        organisationId: organisation.id,
        email: u.email,
        name: u.name,
        passwordHash
      }
    });

    await prisma.bandMembership.upsert({
      where: { bandId_userId: { bandId: band.id, userId: user.id } },
      update: { roleName: u.role },
      create: {
        organisationId: organisation.id,
        bandId: band.id,
        userId: user.id,
        roleName: u.role
      }
    });

    const role = await prisma.role.findUniqueOrThrow({
      where: { organisationId_name: { organisationId: organisation.id, name: u.role } }
    });

    await prisma.userRole.upsert({
      where: {
        organisationId_userId_roleId: {
          organisationId: organisation.id,
          userId: user.id,
          roleId: role.id
        }
      },
      update: {},
      create: {
        organisationId: organisation.id,
        userId: user.id,
        roleId: role.id
      }
    });
  }

  const [owner] = await prisma.user.findMany({ where: { email: 'owner@stageos.local' }, take: 1 });
  if (!owner) throw new Error('Owner missing after seed');

  const now = new Date();
  const gigDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const rehearsalDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  const travelDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const gig = await prisma.event.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      title: 'Camden Headline Show',
      type: EventType.GIG,
      status: EventStatus.CONFIRMED,
      startsAt: gigDate,
      endsAt: new Date(gigDate.getTime() + 4 * 60 * 60 * 1000),
      venueName: 'Camden Hall',
      address: 'London NW1',
      mapUrl: 'https://maps.google.com/?q=Camden+Hall',
      scheduleJson: {
        blocks: [
          { title: 'Load-in', startsAt: new Date(gigDate.getTime() - 2 * 60 * 60 * 1000).toISOString() },
          { title: 'Soundcheck', startsAt: new Date(gigDate.getTime() - 90 * 60 * 1000).toISOString() },
          { title: 'Doors', startsAt: new Date(gigDate.getTime() - 30 * 60 * 1000).toISOString() }
        ]
      },
      checklistJson: {
        tasks: [
          { title: 'Print merch sheet', done: false },
          { title: 'Confirm backline', done: true }
        ]
      }
    }
  });

  await prisma.event.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      title: 'Studio Rehearsal',
      type: EventType.REHEARSAL,
      status: EventStatus.PLANNED,
      startsAt: rehearsalDate,
      endsAt: new Date(rehearsalDate.getTime() + 3 * 60 * 60 * 1000),
      venueName: 'StageOS Rehearsal Rooms',
      address: 'Hackney, London'
    }
  });

  await prisma.event.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      title: 'Travel to Manchester',
      type: EventType.TRAVEL,
      status: EventStatus.CONFIRMED,
      startsAt: travelDate,
      endsAt: new Date(travelDate.getTime() + 6 * 60 * 60 * 1000),
      venueName: 'King\'s Cross'
    }
  });

  const lead = await prisma.lead.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      name: 'Bristol Festival 2026',
      stage: LeadStage.NEGOTIATING,
      contactName: 'Promoter Jane',
      contactEmail: 'jane@festival.example',
      notes: 'Negotiating headline slot'
    }
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      message: 'Initial outreach completed',
      meta: { by: owner.email }
    }
  });

  const song1 = await prisma.song.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      title: 'City Lights',
      key: 'Am',
      bpm: 128,
      durationSec: 210,
      tags: ['opener']
    }
  });

  const song2 = await prisma.song.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      title: 'Roadline',
      key: 'C',
      bpm: 114,
      durationSec: 240,
      tags: ['single']
    }
  });

  const version1 = await prisma.songVersion.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      songId: song1.id,
      name: 'Live 2026 Arrangement',
      arrangementKey: 'Bm'
    }
  });

  const version2 = await prisma.songVersion.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      songId: song2.id,
      name: 'Festival Cut'
    }
  });

  const setlist = await prisma.setlist.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      eventId: gig.id,
      name: 'Camden Main Set'
    }
  });

  await prisma.setlistItem.createMany({
    data: [
      {
        organisationId: organisation.id,
        bandId: band.id,
        setlistId: setlist.id,
        songVersionId: version1.id,
        position: 1,
        durationSec: 210
      },
      {
        organisationId: organisation.id,
        bandId: band.id,
        setlistId: setlist.id,
        songVersionId: version2.id,
        position: 2,
        durationSec: 240
      }
    ]
  });

  const invoice = await prisma.invoice.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      eventId: gig.id,
      invoiceNumber: 'INV-2026-0001',
      status: 'SENT',
      currency: 'GBP',
      issuedAt: now,
      dueAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      subtotal: 1800,
      total: 1800,
      notes: 'Headliner performance fee'
    }
  });

  await prisma.invoiceLine.createMany({
    data: [
      {
        invoiceId: invoice.id,
        description: 'Performance Fee',
        quantity: 1,
        unitPrice: 1800,
        lineTotal: 1800
      }
    ]
  });

  await prisma.expense.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      eventId: gig.id,
      category: 'Transport',
      description: 'Van hire',
      amount: 220,
      spentAt: now
    }
  });

  const members = await prisma.user.findMany({ where: { email: { in: ['member1@stageos.local', 'member2@stageos.local', 'member3@stageos.local'] } } });
  for (const member of members) {
    await prisma.payout.create({
      data: {
        organisationId: organisation.id,
        bandId: band.id,
        eventId: gig.id,
        userId: member.id,
        type: PayoutType.PERCENTAGE,
        percentage: 20,
        currency: 'GBP',
        notes: 'Standard split payout'
      }
    });
  }

  const availabilityRequest = await prisma.availabilityRequest.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      eventId: gig.id,
      targetGroup: 'Band members',
      notes: 'Confirm Camden availability'
    }
  });

  for (const member of members) {
    await prisma.availabilityResponse.create({
      data: {
        organisationId: organisation.id,
        bandId: band.id,
        availabilityRequestId: availabilityRequest.id,
        userId: member.id,
        response: AvailabilityStatus.YES
      }
    });
  }

  const contractAsset = await prisma.fileAsset.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      bucket: 'stageos-assets',
      objectKey: `contracts/${gig.id}/placeholder-contract.pdf`,
      fileName: 'placeholder-contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      availableOffline: true
    }
  });

  await prisma.fileAssetLink.create({
    data: {
      organisationId: organisation.id,
      bandId: band.id,
      fileAssetId: contractAsset.id,
      eventId: gig.id
    }
  });

  await prisma.changeLog.createMany({
    data: [
      {
        organisationId: organisation.id,
        bandId: band.id,
        entityType: 'EVENT',
        entityId: gig.id,
        action: 'create',
        version: 1,
        payload: { title: gig.title }
      },
      {
        organisationId: organisation.id,
        bandId: band.id,
        entityType: 'SETLIST',
        entityId: setlist.id,
        action: 'create',
        version: 1,
        payload: { name: setlist.name }
      }
    ]
  });

  await prisma.auditLog.create({
    data: {
      organisationId: organisation.id,
      actorId: owner.id,
      action: 'seed.initialised',
      entityType: 'Organisation',
      entityId: organisation.id,
      metadata: { seededAt: now.toISOString() }
    }
  });

  console.log('Seed complete. Example placeholder files are metadata-only; upload binaries via /files multipart endpoints.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
