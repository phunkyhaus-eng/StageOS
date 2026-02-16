import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

class SyncOperationDto {
  @IsIn([
    'EVENT',
    'LEAD',
    'SETLIST',
    'SETLIST_ITEM',
    'INVOICE',
    'EXPENSE',
    'PAYOUT',
    'AVAILABILITY_RESPONSE'
  ])
  entity!: string;

  @IsIn(['create', 'update', 'delete', 'setlistOps'])
  operation!: string;

  @IsString()
  clientId!: string;

  @IsUUID()
  entityId!: string;

  @IsUUID()
  bandId!: string;

  @IsOptional()
  @IsInt()
  baseVersion?: number;

  @IsOptional()
  payload?: Record<string, unknown>;

  @IsOptional()
  setlistOps?: Array<Record<string, unknown>>;

  @IsDateString()
  updatedAt!: string;
}

export class SyncPushDto {
  @IsUUID()
  deviceId!: string;

  @IsUUID()
  bandId!: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}

export type SyncOperationInput = SyncOperationDto;
