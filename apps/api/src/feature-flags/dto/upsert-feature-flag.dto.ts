import { FeatureFlagScope } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpsertFeatureFlagDto {
  @IsString()
  key!: string;

  @IsEnum(FeatureFlagScope)
  scope!: FeatureFlagScope;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
