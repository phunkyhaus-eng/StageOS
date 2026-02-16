import { IsArray, IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateWebhookEndpointDto {
  @IsUrl()
  url!: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @IsString()
  secret!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
