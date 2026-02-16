import { IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { LeadStage } from '@prisma/client';

export class CreateLeadDto {
  @IsUUID()
  bandId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
