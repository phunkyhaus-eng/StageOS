import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAvailabilityRequestDto {
  @IsUUID()
  bandId!: string;

  @IsUUID()
  eventId!: string;

  @IsOptional()
  @IsString()
  targetGroup?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  closesAt?: string;
}
