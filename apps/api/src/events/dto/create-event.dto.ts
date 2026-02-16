import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EventType, EventStatus } from '@prisma/client';

export class CreateEventDto {
  @IsUUID()
  bandId!: string;

  @IsString()
  title!: string;

  @IsEnum(EventType)
  type!: EventType;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  venueName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  mapUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
