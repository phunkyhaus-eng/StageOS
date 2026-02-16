import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpsertPluginDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsString()
  version!: string;

  manifest!: {
    hooks: string[];
    handler: string;
    featureFlag?: string;
    configSchema?: Record<string, unknown>;
  };

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  sandboxPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
