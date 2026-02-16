import { Injectable } from '@nestjs/common';
import { LeadStage, Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import type { AuthUser } from '../common/types/auth-user';

function startOfDayUtc(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function endOfDayUtc(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate() + 1));
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  async overview(
    user: AuthUser,
    input: { bandId: string; from?: string; to?: string }
  ) {
    await this.access.ensureBandAccess(user, input.bandId);

    const from = input.from ? new Date(input.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const to = input.to ? new Date(input.to) : new Date();

    const [invoices, expenses, payouts, leads, avail, usage, snapshots] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: input.bandId,
          deletedAt: null,
          createdAt: { gte: from, lte: to }
        },
        select: { total: true, status: true, eventId: true }
      }),
      this.prisma.expense.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: input.bandId,
          deletedAt: null,
          spentAt: { gte: from, lte: to }
        },
        select: { amount: true, eventId: true }
      }),
      this.prisma.payout.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: input.bandId,
          deletedAt: null,
          createdAt: { gte: from, lte: to }
        },
        select: { amount: true, percentage: true }
      }),
      this.prisma.lead.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: input.bandId,
          deletedAt: null,
          createdAt: { gte: from, lte: to }
        },
        select: { id: true, stage: true, convertedEventId: true }
      }),
      this.prisma.availabilityResponse.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: input.bandId,
          deletedAt: null,
          createdAt: { gte: from, lte: to }
        },
        select: { response: true, userId: true }
      }),
      this.prisma.featureUsageEvent.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: input.bandId,
          createdAt: { gte: from, lte: to }
        },
        select: { feature: true, action: true }
      }),
      this.prisma.analyticsDaily.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: input.bandId,
          day: { gte: startOfDayUtc(from), lte: endOfDayUtc(to) }
        },
        orderBy: { day: 'asc' }
      })
    ]);

    const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const payoutTotal = payouts.reduce((sum, payout) => {
      if (payout.amount) return sum + Number(payout.amount);
      return sum;
    }, 0);

    const profit = revenue - expenseTotal - payoutTotal;

    const convertedLeads = leads.filter((lead) => lead.convertedEventId || lead.stage === LeadStage.CONFIRMED);
    const conversionRate = leads.length === 0 ? 0 : convertedLeads.length / leads.length;

    const gigProfits = new Map<string, number>();
    for (const invoice of invoices) {
      if (!invoice.eventId) continue;
      gigProfits.set(invoice.eventId, (gigProfits.get(invoice.eventId) ?? 0) + Number(invoice.total));
    }
    for (const expense of expenses) {
      if (!expense.eventId) continue;
      gigProfits.set(expense.eventId, (gigProfits.get(expense.eventId) ?? 0) - Number(expense.amount));
    }

    const avgGigProfit =
      gigProfits.size === 0
        ? 0
        : Array.from(gigProfits.values()).reduce((sum, value) => sum + value, 0) / gigProfits.size;

    const answered = avail.filter((row) => row.response !== 'PENDING');
    const reliable = avail.filter((row) => row.response === 'YES');
    const availabilityReliability = answered.length === 0 ? 0 : reliable.length / answered.length;

    const usageByFeature = usage.reduce<Record<string, number>>((acc, item) => {
      acc[item.feature] = (acc[item.feature] ?? 0) + 1;
      return acc;
    }, {});

    const payoutsByMember = await this.prisma.payout.groupBy({
      by: ['userId'],
      where: {
        organisationId: user.organisationId,
        bandId: input.bandId,
        deletedAt: null,
        createdAt: { gte: from, lte: to },
        userId: { not: null }
      },
      _sum: { amount: true },
      _count: { _all: true }
    });

    return {
      range: { from, to },
      summary: {
        revenue,
        expenseTotal,
        payoutTotal,
        profit,
        conversionRate,
        avgGigProfit,
        availabilityReliability,
        leadCount: leads.length
      },
      memberPayouts: payoutsByMember,
      featureUsage: usageByFeature,
      dailySnapshots: snapshots
    };
  }

  async availabilityReliability(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);

    const grouped = await this.prisma.availabilityResponse.groupBy({
      by: ['userId', 'response'],
      where: {
        organisationId: user.organisationId,
        bandId,
        deletedAt: null
      },
      _count: { _all: true }
    });

    const perMember = new Map<string, { yes: number; answered: number }>();
    for (const row of grouped) {
      const entry = perMember.get(row.userId) ?? { yes: 0, answered: 0 };
      if (row.response === 'YES') {
        entry.yes += row._count._all;
      }
      if (row.response !== 'PENDING') {
        entry.answered += row._count._all;
      }
      perMember.set(row.userId, entry);
    }

    return Array.from(perMember.entries()).map(([userId, stats]) => ({
      userId,
      reliability: stats.answered === 0 ? 0 : stats.yes / stats.answered,
      answered: stats.answered
    }));
  }

  async featureUsage(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);

    const grouped = await this.prisma.featureUsageEvent.groupBy({
      by: ['feature', 'action'],
      where: {
        organisationId: user.organisationId,
        bandId
      },
      _count: { _all: true },
      orderBy: [{ feature: 'asc' }, { action: 'asc' }]
    });

    return grouped.map((row) => ({
      feature: row.feature,
      action: row.action,
      count: row._count._all
    }));
  }

  async trackFeatureUsage(input: {
    organisationId: string;
    userId?: string;
    bandId?: string;
    feature: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.featureUsageEvent.create({
      data: {
        organisationId: input.organisationId,
        userId: input.userId,
        bandId: input.bandId,
        feature: input.feature,
        action: input.action,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private async rebuildSnapshot(organisationId: string, bandId: string, day: Date) {
    const from = startOfDayUtc(day);
    const to = endOfDayUtc(day);

    const [invoices, expenses, leads, avail, payouts] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: {
          organisationId,
          bandId,
          deletedAt: null,
          createdAt: { gte: from, lt: to }
        },
        select: { total: true }
      }),
      this.prisma.expense.findMany({
        where: {
          organisationId,
          bandId,
          deletedAt: null,
          spentAt: { gte: from, lt: to }
        },
        select: { amount: true }
      }),
      this.prisma.lead.findMany({
        where: {
          organisationId,
          bandId,
          deletedAt: null,
          createdAt: { gte: from, lt: to }
        },
        select: { convertedEventId: true }
      }),
      this.prisma.availabilityResponse.findMany({
        where: {
          organisationId,
          bandId,
          deletedAt: null,
          createdAt: { gte: from, lt: to }
        },
        select: { response: true }
      }),
      this.prisma.payout.findMany({
        where: {
          organisationId,
          bandId,
          deletedAt: null,
          createdAt: { gte: from, lt: to }
        },
        select: { amount: true }
      })
    ]);

    const revenue = invoices.reduce((sum, row) => sum + Number(row.total), 0);
    const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount), 0);
    const payoutTotal = payouts.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const profit = revenue - expenseTotal - payoutTotal;
    const conversion = leads.length === 0 ? 0 : leads.filter((lead) => !!lead.convertedEventId).length / leads.length;
    const answered = avail.filter((item) => item.response !== 'PENDING').length;
    const reliable = avail.filter((item) => item.response === 'YES').length;
    const reliability = answered === 0 ? 0 : reliable / answered;

    await this.prisma.analyticsDaily.upsert({
      where: {
        organisationId_bandId_day: {
          organisationId,
          bandId,
          day: from
        }
      },
      update: {
        revenueTotal: revenue,
        expensesTotal: expenseTotal,
        payoutTotal,
        profitTotal: profit,
        leadConversionRate: conversion,
        avgGigProfit: profit,
        availabilityReliabilityPct: reliability,
        payload: {
          invoices: invoices.length,
          expenses: expenses.length,
          leads: leads.length,
          responses: avail.length
        }
      },
      create: {
        organisationId,
        bandId,
        day: from,
        revenueTotal: revenue,
        expensesTotal: expenseTotal,
        payoutTotal,
        profitTotal: profit,
        leadConversionRate: conversion,
        avgGigProfit: profit,
        availabilityReliabilityPct: reliability,
        payload: {
          invoices: invoices.length,
          expenses: expenses.length,
          leads: leads.length,
          responses: avail.length
        }
      }
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async rebuildDailyAggregations() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const bands = await this.prisma.band.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        organisationId: true
      }
    });

    for (const band of bands) {
      await this.rebuildSnapshot(band.organisationId, band.id, yesterday);
    }
  }
}
