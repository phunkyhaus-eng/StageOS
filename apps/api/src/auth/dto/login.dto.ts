import { IsEmail, IsString, MinLength } from 'class-validator';
import { IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  totpCode?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}
