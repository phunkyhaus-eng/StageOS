import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class InvoiceLineDto {
  @IsString()
  description!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  bandId!: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsString()
  invoiceNumber!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
