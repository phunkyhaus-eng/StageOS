import { IsUUID } from 'class-validator';

export class AssignManualDto {
  @IsUUID()
  personId!: string;
}
