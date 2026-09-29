import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePartnerVerificationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  parchiId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  externalReference: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  eventLabel?: string;
}
