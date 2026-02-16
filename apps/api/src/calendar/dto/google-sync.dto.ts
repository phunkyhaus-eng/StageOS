import { IsString, IsUUID } from 'class-validator';

export class GoogleSyncDto {
  @IsUUID()
  bandId!: string;

  @IsString()
  accessToken!: string;

  @IsString()
  calendarId!: string;
}
