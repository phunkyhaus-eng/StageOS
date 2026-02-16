import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import JSZip from 'jszip';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types/auth-user';
import { AuditService } from '../common/audit.service';

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return '';
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key));
      return acc;
    }, new Set<string>())
  );

  const body = rows.map((row) =>
    headers
      .map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );

  return [`${headers.join(',')}`, ...body].join('\n');
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async exportOrganisationData(user: AuthUser) {
    const organisationId = user.organisationId;

    const [users, bands, events, leads, invoices, expenses, payouts, files, auditLogs] =
      await this.prisma.$transaction([
        this.prisma.user.findMany({ where: { organisationId } }),
        this.prisma.band.findMany({ where: { organisationId } }),
        this.prisma.event.findMany({ where: { organisationId } }),
        this.prisma.lead.findMany({ where: { organisationId } }),
        this.prisma.invoice.findMany({ where: { organisationId } }),
        this.prisma.expense.findMany({ where: { organisationId } }),
        this.prisma.payout.findMany({ where: { organisationId } }),
        this.prisma.fileAsset.findMany({ where: { organisationId } }),
        this.prisma.auditLog.findMany({ where: { organisationId } })
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      organisationId,
      users,
      bands,
      events,
      leads,
      invoices,
      expenses,
      payouts,
      files,
      auditLogs
    };

    const zip = new JSZip();
    zip.file('export.json', JSON.stringify(payload, null, 2));
    zip.file('users.csv', toCsv(users as unknown as Array<Record<string, unknown>>));
    zip.file('bands.csv', toCsv(bands as unknown as Array<Record<string, unknown>>));
    zip.file('events.csv', toCsv(events as unknown as Array<Record<string, unknown>>));
    zip.file('leads.csv', toCsv(leads as unknown as Array<Record<string, unknown>>));
    zip.file('invoices.csv', toCsv(invoices as unknown as Array<Record<string, unknown>>));
    zip.file('expenses.csv', toCsv(expenses as unknown as Array<Record<string, unknown>>));
    zip.file('payouts.csv', toCsv(payouts as unknown as Array<Record<string, unknown>>));
    zip.file('files.csv', toCsv(files as unknown as Array<Record<string, unknown>>));

    await this.audit.log({
      organisationId,
      actorId: user.id,
      action: 'compliance.export',
      entityType: 'Organisation',
      entityId: organisationId
    });

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  async deleteAccount(user: AuthUser) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          deletedAt: new Date(),
          email: `${user.id}+deleted@redacted.stageos`,
          name: 'Deleted User'
        }
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      }),
      this.prisma.userSession.updateMany({
        where: {
          userId: user.id,
          status: 'ACTIVE'
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date()
        }
      })
    ]);

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'compliance.account_delete',
      entityType: 'User',
      entityId: user.id
    });

    return { ok: true };
  }

  async backupPolicy() {
    return {
      provider: 'S3-compatible encrypted backups',
      encryption: 'AES-256 server-side plus object lock',
      cadence: {
        snapshots: 'every 6 hours',
        fullBackup: 'daily at 02:30 UTC'
      },
      retention: {
        hotDays: 14,
        warmDays: 60,
        coldDays: 365,
        rotation: 'grandfather-father-son'
      },
      restoreTests: 'weekly automated integrity and monthly restore drills'
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async retentionPurge() {
    const organisations = await this.prisma.organisation.findMany({
      where: { deletedAt: null },
      select: { id: true, retentionDays: true }
    });

    for (const org of organisations) {
      const cutoff = new Date(Date.now() - org.retentionDays * 24 * 60 * 60 * 1000);

      await this.prisma.$transaction([
        this.prisma.event.deleteMany({ where: { organisationId: org.id, deletedAt: { lt: cutoff } } }),
        this.prisma.lead.deleteMany({ where: { organisationId: org.id, deletedAt: { lt: cutoff } } }),
        this.prisma.setlist.deleteMany({ where: { organisationId: org.id, deletedAt: { lt: cutoff } } }),
        this.prisma.song.deleteMany({ where: { organisationId: org.id, deletedAt: { lt: cutoff } } }),
        this.prisma.fileAsset.deleteMany({ where: { organisationId: org.id, deletedAt: { lt: cutoff } } }),
        this.prisma.expense.deleteMany({ where: { organisationId: org.id, deletedAt: { lt: cutoff } } }),
        this.prisma.invoice.deleteMany({ where: { organisationId: org.id, deletedAt: { lt: cutoff } } }),
        this.prisma.payout.deleteMany({ where: { organisationId: org.id, deletedAt: { lt: cutoff } } }),
        this.prisma.userSession.deleteMany({
          where: {
            organisationId: org.id,
            OR: [{ status: 'REVOKED' }, { status: 'EXPIRED' }],
            updatedAt: { lt: cutoff }
          }
        }),
        this.prisma.refreshToken.deleteMany({
          where: {
            revokedAt: { lt: cutoff }
          }
        })
      ]);
    }
  }
}
