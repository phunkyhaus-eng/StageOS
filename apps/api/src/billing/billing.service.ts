import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import crypto from 'crypto';
import { config } from '../config';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

const PLAN_FEATURES: Record<SubscriptionTier, string[]> = {
  FREE: [
    'core.events',
    'crm.pipeline',
    'availability.workflow',
    'setlists.basic',
    'finance.basic',
    'files.basic',
    'offline.sync',
    'tour.routing',
    'analytics.basic',
    'api.public'
  ],
  PRO: [
    'core.events',
    'crm.pipeline',
    'availability.workflow',
    'setlists.basic',
    'finance.basic',
    'finance.advanced',
    'files.basic',
    'offline.sync',
    'tour.routing',
    'analytics.basic',
    'analytics.advanced',
    'api.public',
    'usage.billing',
    'plugins'
  ],
  TOURING_PRO: [
    'core.events',
    'crm.pipeline',
    'availability.workflow',
    'setlists.basic',
    'finance.basic',
    'finance.advanced',
    'files.basic',
    'offline.sync',
    'tour.routing',
    'analytics.basic',
    'analytics.advanced',
    'api.public',
    'usage.billing',
    'plugins',
    'whiteLabel.branding',
    'custom.domain'
  ]
};

interface StripeSubscriptionLike {
  id: string;
  customer: string;
  status: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  items?: {
    data: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
  metadata?: {
    organisationId?: string;
  };
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private getPriceForTier(tier: SubscriptionTier): string {
    if (tier === SubscriptionTier.PRO) {
      if (!config.stripe.prices.pro) throw new BadRequestException('Stripe price for PRO tier is not configured');
      return config.stripe.prices.pro;
    }

    if (tier === SubscriptionTier.TOURING_PRO) {
      if (!config.stripe.prices.touringPro) {
        throw new BadRequestException('Stripe price for TOURING_PRO tier is not configured');
      }
      return config.stripe.prices.touringPro;
    }

    throw new BadRequestException('Free tier does not require checkout');
  }

  private mapTierFromPriceId(priceId?: string): SubscriptionTier {
    if (priceId && priceId === config.stripe.prices.touringPro) {
      return SubscriptionTier.TOURING_PRO;
    }

    if (priceId && priceId === config.stripe.prices.pro) {
      return SubscriptionTier.PRO;
    }

    return SubscriptionTier.FREE;
  }

  private mapStripeStatus(status: string): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
      case 'unpaid':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'paused':
        return SubscriptionStatus.PAUSED;
      default:
        return SubscriptionStatus.PAST_DUE;
    }
  }

  private async stripeRequest(path: string, body: URLSearchParams) {
    if (!config.stripe.secretKey) {
      throw new BadRequestException('Stripe integration is not configured');
    }

    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.stripe.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const message = String((payload.error as { message?: string } | undefined)?.message ?? 'Stripe request failed');
      throw new BadRequestException(message);
    }

    return payload;
  }

  async ensureSubscription(organisationId: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: {
        organisationId,
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existing) return existing;

    return this.prisma.subscription.create({
      data: {
        organisationId,
        tier: SubscriptionTier.FREE,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        graceUntil: new Date(Date.now() + config.limits.gracePeriodDays * 24 * 60 * 60 * 1000)
      }
    });
  }

  async getCurrentSubscription(organisationId: string) {
    const subscription = await this.ensureSubscription(organisationId);
    const inGrace =
      subscription.status === SubscriptionStatus.PAST_DUE &&
      !!subscription.graceUntil &&
      subscription.graceUntil > new Date();

    return {
      ...subscription,
      inGrace,
      features: PLAN_FEATURES[subscription.tier]
    };
  }

  async createCheckoutSession(user: AuthUser, dto: CreateCheckoutDto) {
    if (dto.tier === SubscriptionTier.FREE) {
      throw new BadRequestException('Use billing downgrade endpoint for FREE tier');
    }

    const subscription = await this.ensureSubscription(user.organisationId);
    const priceId = this.getPriceForTier(dto.tier);

    let stripeCustomerId = subscription.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripeRequest(
        'customers',
        new URLSearchParams({
          email: user.email,
          name: user.email,
          'metadata[organisationId]': user.organisationId
        })
      );

      stripeCustomerId = String(customer.id);

      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          stripeCustomerId
        }
      });
    }

    const params = new URLSearchParams({
      mode: 'subscription',
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
      customer: stripeCustomerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'subscription_data[metadata][organisationId]': user.organisationId,
      'subscription_data[metadata][targetTier]': dto.tier,
      'metadata[organisationId]': user.organisationId,
      'metadata[targetTier]': dto.tier
    });

    if (dto.addOnKey) {
      params.append('metadata[addOnKey]', dto.addOnKey);
    }

    const session = await this.stripeRequest('checkout/sessions', params);

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'billing.checkout.create',
      entityType: 'Subscription',
      entityId: subscription.id,
      metadata: {
        tier: dto.tier,
        sessionId: session.id
      }
    });

    return {
      checkoutSessionId: String(session.id),
      checkoutUrl: String(session.url)
    };
  }

  private async syncStripeSubscription(data: StripeSubscriptionLike) {
    const organisationId = data.metadata?.organisationId;
    if (!organisationId) {
      return;
    }

    const priceId = data.items?.data?.[0]?.price?.id;
    const tier = this.mapTierFromPriceId(priceId);

    const subscription = await this.ensureSubscription(organisationId);
    const status = this.mapStripeStatus(data.status);
    const now = new Date();

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        tier,
        status,
        stripeCustomerId: data.customer,
        stripeSubscriptionId: data.id,
        currentPeriodStart: data.current_period_start ? new Date(data.current_period_start * 1000) : null,
        currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
        graceUntil:
          status === SubscriptionStatus.PAST_DUE
            ? new Date(now.getTime() + config.limits.gracePeriodDays * 24 * 60 * 60 * 1000)
            : null
      }
    });
  }

  private verifyStripeSignature(rawBody: string, signatureHeader: string): boolean {
    if (!config.stripe.webhookSecret) {
      return true;
    }

    const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
      const [key, value] = part.split('=');
      if (key && value) acc[key] = value;
      return acc;
    }, {});

    const timestamp = parts.t;
    const sentV1 = parts.v1;

    if (!timestamp || !sentV1) {
      return false;
    }

    const expected = crypto
      .createHmac('sha256', config.stripe.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(sentV1), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async handleStripeWebhook(input: {
    signatureHeader: string | undefined;
    body: Record<string, unknown>;
  }) {
    const rawBody = JSON.stringify(input.body);

    if (config.stripe.webhookSecret) {
      if (!input.signatureHeader || !this.verifyStripeSignature(rawBody, input.signatureHeader)) {
        throw new UnauthorizedException('Invalid Stripe webhook signature');
      }
    }

    const eventType = String(input.body.type ?? '');
    const data = (input.body.data as { object?: StripeSubscriptionLike } | undefined)?.object;

    if (!data) {
      return { received: true, ignored: true };
    }

    if (
      eventType === 'customer.subscription.created' ||
      eventType === 'customer.subscription.updated' ||
      eventType === 'customer.subscription.deleted'
    ) {
      await this.syncStripeSubscription(data);
      return { received: true, synced: true };
    }

    return { received: true, ignored: true };
  }

  async usage(organisationId: string, bandId?: string) {
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [eventCount, storage, fileCount] = await this.prisma.$transaction([
      this.prisma.event.count({
        where: {
          organisationId,
          bandId,
          startsAt: { gte: periodStart },
          deletedAt: null
        }
      }),
      this.prisma.fileAsset.aggregate({
        where: {
          organisationId,
          bandId,
          deletedAt: null
        },
        _sum: {
          sizeBytes: true
        }
      }),
      this.prisma.fileAsset.count({
        where: {
          organisationId,
          bandId,
          deletedAt: null
        }
      })
    ]);

    await this.prisma.storageUsageSnapshot.create({
      data: {
        organisationId,
        bandId,
        bytesTotal: BigInt(storage._sum.sizeBytes ?? 0),
        fileCount
      }
    });

    return {
      periodStart,
      eventCount,
      storageBytes: storage._sum.sizeBytes ?? 0,
      fileCount
    };
  }

  async canUseFeature(organisationId: string, userId: string, feature: string) {
    const subscription = await this.getCurrentSubscription(organisationId);

    const hasTierFeature = subscription.features.includes(feature);
    if (!hasTierFeature) {
      return {
        allowed: false,
        reason: `Feature ${feature} is not available on ${subscription.tier}`
      };
    }

    if (
      subscription.status === SubscriptionStatus.PAST_DUE &&
      !subscription.inGrace
    ) {
      return {
        allowed: false,
        reason: 'Subscription payment is overdue and grace period has ended'
      };
    }

    if (subscription.status === SubscriptionStatus.CANCELED) {
      return {
        allowed: false,
        reason: 'Subscription is canceled'
      };
    }

    const userFlag = await this.prisma.featureFlag.findFirst({
      where: {
        organisationId,
        userId,
        key: `feature:${feature}`,
        deletedAt: null
      }
    });

    if (userFlag && !userFlag.enabled) {
      return {
        allowed: false,
        reason: 'Feature disabled by admin policy'
      };
    }

    return {
      allowed: true
    };
  }

  async downgradeToFree(user: AuthUser) {
    const subscription = await this.ensureSubscription(user.organisationId);
    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        tier: SubscriptionTier.FREE,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(),
        graceUntil: null
      }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'billing.downgrade.free',
      entityType: 'Subscription',
      entityId: updated.id
    });

    return updated;
  }
}
