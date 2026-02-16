import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { PayoutType } from '@prisma/client';

export class CreatePayoutDto {
  @IsUUID()
  bandId!: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsEnum(PayoutType)
  type!: PayoutType;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  percentage?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
