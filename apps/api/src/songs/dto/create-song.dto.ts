import { IsArray, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSongDto {
  @IsUUID()
  bandId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsInt()
  bpm?: number;

  @IsOptional()
  @IsInt()
  durationSec?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
