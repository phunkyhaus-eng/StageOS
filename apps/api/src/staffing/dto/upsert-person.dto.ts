import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEmail, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { PersonStatus, StaffRole } from '@prisma/client';

export class CreatePersonDto {
  @IsUUID()
  bandId!: string;

  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(PersonStatus)
  status?: PersonStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  roles?: StaffRole[];
}

export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(PersonStatus)
  status?: PersonStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  roles?: StaffRole[];

  @IsOptional()
  availabilityPrefs?: Record<string, unknown>;
}

export class BulkCreatePeopleDto {
  @IsUUID()
  bandId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreatePersonDto)
  people!: CreatePersonDto[];
}
