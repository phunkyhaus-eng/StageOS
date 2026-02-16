import { Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import type { AuthUser } from '../common/types/auth-user';
import { ChangeLogService } from '../sync/change-log.service';
import { AuditService } from '../common/audit.service';
import { EncryptionService } from '../common/encryption.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePayoutDto } from './dto/create-payout.dto';

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changelog: ChangeLogService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService
  ) {}

  private encryptNote(note?: string): string | null {
    if (!note) return null;
    return this.encryption.encrypt(note);
  }

  private decryptNote(note?: string | null): string | null {
    return this.encryption.decrypt(note);
  }

  private withDecryptedNotes<T extends { notes: string | null }>(item: T): T {
    return {
      ...item,
      notes: this.decryptNote(item.notes)
    };
  }

  async summary(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);

    const [invoices, expenses, payouts] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null }
      }),
      this.prisma.expense.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null }
      }),
      this.prisma.payout.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null }
      })
    ]);

    const invoiceTotal = invoices.reduce((sum, i) => sum + Number(i.total), 0);
    const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const payoutTotal = payouts.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

    return {
      invoiceTotal,
      expenseTotal,
      payoutTotal,
      profit: invoiceTotal - expenseTotal - payoutTotal,
      unpaidInvoices: invoices.filter((i) => i.status !== 'PAID').length
    };
  }

  async profitDashboard(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);

    const [invoices, expenses, payouts] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null },
        select: { createdAt: true, total: true }
      }),
      this.prisma.expense.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null },
        select: { spentAt: true, amount: true }
      }),
      this.prisma.payout.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null },
        select: { createdAt: true, amount: true }
      })
    ]);

    const monthly = new Map<string, { revenue: number; expenses: number; payouts: number }>();

    const ensureMonth = (date: Date) => {
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const existing = monthly.get(key) ?? { revenue: 0, expenses: 0, payouts: 0 };
      monthly.set(key, existing);
      return existing;
    };

    for (const invoice of invoices) {
      ensureMonth(invoice.createdAt).revenue += Number(invoice.total);
    }
    for (const expense of expenses) {
      ensureMonth(expense.spentAt).expenses += Number(expense.amount);
    }
    for (const payout of payouts) {
      ensureMonth(payout.createdAt).payouts += Number(payout.amount ?? 0);
    }

    return Array.from(monthly.entries())
      .map(([month, values]) => ({
        month,
        revenue: values.revenue,
        expenses: values.expenses,
        payouts: values.payouts,
        profit: values.revenue - values.expenses - values.payouts
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async listInvoices(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);
    const invoices = await this.prisma.invoice.findMany({
      where: { organisationId: user.organisationId, bandId, deletedAt: null },
      include: { lines: true },
      orderBy: { createdAt: 'desc' }
    });

    return invoices.map((invoice) => this.withDecryptedNotes(invoice));
  }

  async createInvoice(user: AuthUser, dto: CreateInvoiceDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const subtotal = dto.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

    const invoice = await this.prisma.invoice.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        eventId: dto.eventId,
        leadId: dto.leadId,
        invoiceNumber: dto.invoiceNumber,
        status: dto.status ?? 'DRAFT',
        currency: dto.currency ?? 'USD',
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        subtotal,
        total: subtotal,
        notes: this.encryptNote(dto.notes),
        lines: {
          create: dto.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.quantity * line.unitPrice
          }))
        }
      },
      include: { lines: true }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'INVOICE',
      entityId: invoice.id,
      action: 'create',
      version: invoice.version,
      payload: { invoiceNumber: invoice.invoiceNumber, total: invoice.total.toString() }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'invoice.create',
      entityType: 'Invoice',
      entityId: invoice.id
    });

    return this.withDecryptedNotes(invoice);
  }

  async invoicePdf(user: AuthUser, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      include: {
        lines: true,
        band: { select: { name: true } },
        event: { select: { title: true, startsAt: true } }
      }
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    await this.access.ensureBandAccess(user, invoice.bandId);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let y = 790;
    page.drawText('StageOS Invoice', { x: 48, y, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 32;

    const draw = (label: string, value: string) => {
      page.drawText(label, { x: 48, y, size: 10, font: bold });
      page.drawText(value, { x: 180, y, size: 10, font });
      y -= 16;
    };

    draw('Invoice Number', invoice.invoiceNumber);
    draw('Band', invoice.band.name);
    draw('Status', invoice.status);
    draw('Issued', invoice.issuedAt ? invoice.issuedAt.toISOString().slice(0, 10) : '-');
    draw('Due', invoice.dueAt ? invoice.dueAt.toISOString().slice(0, 10) : '-');
    draw('Event', invoice.event?.title ?? '-');

    y -= 8;
    page.drawText('Line Items', { x: 48, y, size: 11, font: bold });
    y -= 18;

    for (const line of invoice.lines) {
      page.drawText(line.description, { x: 48, y, size: 10, font });
      page.drawText(`${line.quantity} x ${line.unitPrice}`, { x: 320, y, size: 10, font });
      page.drawText(`${line.lineTotal}`, { x: 500, y, size: 10, font });
      y -= 14;
    }

    y -= 12;
    page.drawText(`Total: ${invoice.total} ${invoice.currency}`, { x: 48, y, size: 13, font: bold });

    const notes = this.decryptNote(invoice.notes);
    if (notes) {
      y -= 24;
      page.drawText('Notes', { x: 48, y, size: 11, font: bold });
      y -= 14;
      page.drawText(notes.slice(0, 380), { x: 48, y, size: 10, font, maxWidth: 500, lineHeight: 12 });
    }

    const bytes = await pdf.save();

    return {
      fileName: `${invoice.invoiceNumber}.pdf`,
      contentType: 'application/pdf',
      base64: Buffer.from(bytes).toString('base64')
    };
  }

  async createExpense(user: AuthUser, dto: CreateExpenseDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const expense = await this.prisma.expense.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        eventId: dto.eventId,
        category: dto.category,
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency ?? 'USD',
        spentAt: new Date(dto.spentAt),
        notes: this.encryptNote(dto.notes)
      }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'EXPENSE',
      entityId: expense.id,
      action: 'create',
      version: expense.version,
      payload: { amount: expense.amount.toString() }
    });

    return this.withDecryptedNotes(expense);
  }

  async createPayout(user: AuthUser, dto: CreatePayoutDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    let amount = dto.amount;
    if (!amount && dto.type === 'PERCENTAGE' && dto.percentage && dto.eventId) {
      const [invoices, expenses] = await this.prisma.$transaction([
        this.prisma.invoice.findMany({
          where: {
            organisationId: user.organisationId,
            eventId: dto.eventId,
            deletedAt: null
          },
          select: { total: true }
        }),
        this.prisma.expense.findMany({
          where: {
            organisationId: user.organisationId,
            eventId: dto.eventId,
            deletedAt: null
          },
          select: { amount: true }
        })
      ]);

      const net =
        invoices.reduce((sum, i) => sum + Number(i.total), 0) -
        expenses.reduce((sum, e) => sum + Number(e.amount), 0);
      amount = (net * dto.percentage) / 100;
    }

    const payout = await this.prisma.payout.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        eventId: dto.eventId,
        userId: dto.userId,
        type: dto.type,
        amount,
        percentage: dto.percentage,
        currency: dto.currency ?? 'USD',
        notes: this.encryptNote(dto.notes)
      }
    });

    await this.changelog.append({
      organisationId: user.organisationId,
      bandId: dto.bandId,
      entityType: 'PAYOUT',
      entityId: payout.id,
      action: 'create',
      version: payout.version,
      payload: { type: payout.type, amount: payout.amount?.toString() }
    });

    return this.withDecryptedNotes(payout);
  }

  async listExpenses(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);
    const expenses = await this.prisma.expense.findMany({
      where: { organisationId: user.organisationId, bandId, deletedAt: null },
      orderBy: { spentAt: 'desc' }
    });

    return expenses.map((expense) => this.withDecryptedNotes(expense));
  }

  async listPayouts(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);
    const payouts = await this.prisma.payout.findMany({
      where: { organisationId: user.organisationId, bandId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });

    return payouts.map((payout) => this.withDecryptedNotes(payout));
  }

  async exportCsv(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);

    const [invoices, expenses, payouts] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null },
        orderBy: { createdAt: 'asc' }
      }),
      this.prisma.expense.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null },
        orderBy: { spentAt: 'asc' }
      }),
      this.prisma.payout.findMany({
        where: { organisationId: user.organisationId, bandId, deletedAt: null },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    const rows = [
      ['type', 'id', 'date', 'status', 'description', 'amount', 'currency', 'notes'],
      ...invoices.map((invoice) => [
        'INVOICE',
        invoice.id,
        invoice.createdAt.toISOString(),
        invoice.status,
        invoice.invoiceNumber,
        Number(invoice.total).toFixed(2),
        invoice.currency,
        this.decryptNote(invoice.notes) ?? ''
      ]),
      ...expenses.map((expense) => [
        'EXPENSE',
        expense.id,
        expense.spentAt.toISOString(),
        expense.category,
        expense.description,
        Number(expense.amount).toFixed(2),
        expense.currency,
        this.decryptNote(expense.notes) ?? ''
      ]),
      ...payouts.map((payout) => [
        'PAYOUT',
        payout.id,
        payout.createdAt.toISOString(),
        payout.type,
        payout.userId ?? '',
        Number(payout.amount ?? 0).toFixed(2),
        payout.currency,
        this.decryptNote(payout.notes) ?? ''
      ])
    ];

    return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  }

  async taxExport(user: AuthUser, bandId: string, year: number) {
    await this.access.ensureBandAccess(user, bandId);

    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));

    const [invoices, expenses] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where: {
          organisationId: user.organisationId,
          bandId,
          deletedAt: null,
          issuedAt: {
            gte: from,
            lt: to
          }
        },
        select: {
          issuedAt: true,
          total: true
        }
      }),
      this.prisma.expense.findMany({
        where: {
          organisationId: user.organisationId,
          bandId,
          deletedAt: null,
          spentAt: {
            gte: from,
            lt: to
          }
        },
        select: {
          spentAt: true,
          amount: true
        }
      })
    ]);

    const monthly = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      income: 0,
      expenses: 0
    }));

    for (const invoice of invoices) {
      if (!invoice.issuedAt) continue;
      const month = invoice.issuedAt.getUTCMonth();
      const bucket = monthly[month];
      if (bucket) {
        bucket.income += Number(invoice.total);
      }
    }

    for (const expense of expenses) {
      const month = expense.spentAt.getUTCMonth();
      const bucket = monthly[month];
      if (bucket) {
        bucket.expenses += Number(expense.amount);
      }
    }

    return monthly.map((entry) => ({
      ...entry,
      taxableProfit: entry.income - entry.expenses
    }));
  }
}
