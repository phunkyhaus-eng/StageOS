import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class SyncPullDto {
  @IsUUID()
  deviceId!: string;

  @IsUUID()
  bandId!: string;

  @IsOptional()
  @IsString()
  cursor?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}
