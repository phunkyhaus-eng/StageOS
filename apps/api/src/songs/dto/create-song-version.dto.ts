import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSongVersionDto {
  @IsUUID()
  songId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  arrangementKey?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
