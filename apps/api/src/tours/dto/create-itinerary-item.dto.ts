import { ItineraryType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateItineraryItemDto {
  @IsEnum(ItineraryType)
  type!: ItineraryType;

  @IsString()
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;
}
