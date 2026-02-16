import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTourDto {
  @IsUUID()
  bandId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
