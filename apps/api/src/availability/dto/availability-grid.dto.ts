import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AvailabilityGridDto {
  @IsUUID()
  bandId!: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
