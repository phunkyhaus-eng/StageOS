import { IsArray, IsUUID } from 'class-validator';

export class AddTourEventDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  eventIds!: string[];
}
