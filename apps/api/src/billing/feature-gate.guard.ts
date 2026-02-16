import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BILLING_FEATURE_KEY } from './require-feature.decorator';
import { BillingService } from './billing.service';

@Injectable()
export class FeatureGateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(BILLING_FEATURE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!feature) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      user?: {
        id: string;
        organisationId: string;
      };
    }>();

    if (!req.user) {
      return true;
    }

    const gate = await this.billing.canUseFeature(req.user.organisationId, req.user.id, feature);
    if (!gate.allowed) {
      throw new ForbiddenException(gate.reason ?? 'Feature unavailable on current plan');
    }

    return true;
  }
}
