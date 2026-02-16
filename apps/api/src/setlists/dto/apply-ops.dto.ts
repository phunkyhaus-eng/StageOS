import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, ValidateNested } from 'class-validator';
import { z } from 'zod';
import { setlistOperationSchema } from '@stageos/shared';

class SetlistOperationDto {
  op!: string;
  clientOpId!: string;
  itemId!: string;
  afterItemId?: string | null;
  songVersionId?: string;
  notes?: string;
  durationSec?: number;
}

export class ApplySetlistOpsDto {
  @IsUUID()
  bandId!: string;

  @IsInt()
  baseVersion!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetlistOperationDto)
  operations!: z.infer<typeof setlistOperationSchema>[];
}
