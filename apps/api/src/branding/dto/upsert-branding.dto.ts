import { IsOptional, IsString } from 'class-validator';

export class UpsertBrandingDto {
  @IsString()
  host!: string;

  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  emailTemplates?: Record<string, string>;
}
