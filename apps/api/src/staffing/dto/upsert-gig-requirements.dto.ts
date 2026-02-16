import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { OfferPolicy, StaffRole } from '@prisma/client';

export class RequirementInputDto {
  @IsEnum(StaffRole)
  role!: StaffRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  quantity?: number;

  @IsOptional()
  @IsEnum(OfferPolicy)
  offerPolicy?: OfferPolicy;

  @IsArray()
  @IsUUID('4', { each: true })
  rankedPersonIds!: string[];
}

export class UpsertGigRequirementsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RequirementInputDto)
  requirements!: RequirementInputDto[];
}
