import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RejectQrRedemptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
