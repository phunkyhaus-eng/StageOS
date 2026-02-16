import { IsString, MinLength } from 'class-validator';

export class VerifyPersonEmailDto {
  @IsString()
  @MinLength(12)
  token!: string;
}
