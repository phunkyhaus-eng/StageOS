import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { AuthUser } from '../common/types/auth-user';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getSubscription(@CurrentUser() user: AuthUser) {
    return this.billing.getCurrentSubscription(user.organisationId);
  }

  @Get('usage')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('read:finance')
  getUsage(@CurrentUser() user: AuthUser, @Query('bandId') bandId?: string) {
    return this.billing.usage(user.organisationId, bandId);
  }

  @Get('features')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async features(@CurrentUser() user: AuthUser) {
    const subscription = await this.billing.getCurrentSubscription(user.organisationId);
    return {
      tier: subscription.tier,
      status: subscription.status,
      features: subscription.features,
      inGrace: subscription.inGrace
    };
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('write:finance')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CreateCheckoutDto) {
    return this.billing.createCheckoutSession(user, dto);
  }

  @Post('downgrade/free')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('write:finance')
  downgrade(@CurrentUser() user: AuthUser) {
    return this.billing.downgradeToFree(user);
  }

  @Post('feature-check')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  checkFeature(@CurrentUser() user: AuthUser, @Body() dto: { feature: string }) {
    return this.billing.canUseFeature(user.organisationId, user.id, dto.feature);
  }

  @Post('webhook')
  webhook(
    @Headers('stripe-signature') signatureHeader: string | undefined,
    @Body() body: Record<string, unknown>
  ) {
    return this.billing.handleStripeWebhook({ signatureHeader, body });
  }
}
