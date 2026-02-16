import { IsArray, IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { StaffRole } from '@prisma/client';

export class UpdateMusicianProfileDto {
  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  roles?: StaffRole[];

  @IsOptional()
  @IsObject()
  availabilityPrefs?: Record<string, unknown>;
}
