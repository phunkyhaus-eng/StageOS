import { IsString, IsUUID } from 'class-validator';

export class CreateFileVersionDto {
  @IsUUID()
  sourceFileId!: string;

  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;
}
