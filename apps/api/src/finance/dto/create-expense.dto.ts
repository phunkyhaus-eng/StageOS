import { IsDateString, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateExpenseDto {
  @IsUUID()
  bandId!: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsString()
  category!: string;

  @IsString()
  description!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  spentAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
