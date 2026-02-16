import { AvailabilityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class RespondAvailabilityDto {
  @IsEnum(AvailabilityStatus)
  response!: AvailabilityStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
