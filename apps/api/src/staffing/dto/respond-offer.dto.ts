import { IsEnum } from 'class-validator';

export enum OfferDecision {
  YES = 'YES',
  NO = 'NO'
}

export class RespondOfferDto {
  @IsEnum(OfferDecision)
  decision!: OfferDecision;
}
