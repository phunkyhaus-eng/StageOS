import { IsNumber, IsOptional } from 'class-validator';

export class TourSheetQueryDto {
  @IsOptional()
  @IsNumber()
  fuelPricePerLiter?: number;

  @IsOptional()
  @IsNumber()
  litersPer100Km?: number;
}
