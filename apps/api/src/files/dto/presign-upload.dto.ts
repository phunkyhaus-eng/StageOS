import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class PresignUploadDto {
  @IsUUID()
  bandId!: string;

  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  sizeBytes!: number;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  songVersionId?: string;
}
