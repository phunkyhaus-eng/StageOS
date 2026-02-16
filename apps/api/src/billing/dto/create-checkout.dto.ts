import { SubscriptionTier } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateCheckoutDto {
  @IsEnum(SubscriptionTier)
  tier!: SubscriptionTier;

  @IsUrl()
  successUrl!: string;

  @IsUrl()
  cancelUrl!: string;

  @IsOptional()
  @IsString()
  addOnKey?: string;
}
