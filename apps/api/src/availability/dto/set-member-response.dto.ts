import { AvailabilityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class SetMemberResponseDto {
  @IsUUID()
  userId!: string;

  @IsEnum(AvailabilityStatus)
  response!: AvailabilityStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
