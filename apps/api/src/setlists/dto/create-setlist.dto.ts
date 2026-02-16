import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSetlistDto {
  @IsUUID()
  bandId!: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  locked?: boolean;
}
