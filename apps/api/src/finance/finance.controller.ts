import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  @Permissions('read:finance')
  summary(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.finance.summary(user, bandId);
  }

  @Get('dashboard')
  @Permissions('read:finance')
  dashboard(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.finance.profitDashboard(user, bandId);
  }

  @Get('invoices')
  @Permissions('read:finance')
  listInvoices(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.finance.listInvoices(user, bandId);
  }

  @Post('invoices')
  @Permissions('write:finance')
  createInvoice(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.finance.createInvoice(user, dto);
  }

  @Get('invoices/:id/pdf')
  @Permissions('read:finance')
  invoicePdf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.finance.invoicePdf(user, id);
  }

  @Get('expenses')
  @Permissions('read:finance')
  listExpenses(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.finance.listExpenses(user, bandId);
  }

  @Post('expenses')
  @Permissions('write:finance')
  createExpense(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.finance.createExpense(user, dto);
  }

  @Get('payouts')
  @Permissions('read:finance')
  listPayouts(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.finance.listPayouts(user, bandId);
  }

  @Post('payouts')
  @Permissions('write:finance')
  createPayout(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutDto) {
    return this.finance.createPayout(user, dto);
  }

  @Get('export/csv')
  @Permissions('read:finance')
  exportCsv(@CurrentUser() user: AuthUser, @Query('bandId') bandId: string) {
    return this.finance.exportCsv(user, bandId);
  }

  @Get('export/tax')
  @Permissions('read:finance')
  exportTax(
    @CurrentUser() user: AuthUser,
    @Query('bandId') bandId: string,
    @Query('year') yearRaw?: string
  ) {
    const year = Number(yearRaw ?? new Date().getUTCFullYear());
    return this.finance.taxExport(user, bandId, year);
  }
}
