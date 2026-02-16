import { IsOptional, IsUUID } from 'class-validator';

export class ListFilesDto {
  @IsUUID()
  bandId!: string;

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
