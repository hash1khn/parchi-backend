import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectPartnerVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
