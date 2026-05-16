import { IsUUID } from 'class-validator';

export class InitiateQrRedemptionDto {
  @IsUUID()
  branchId: string;

  @IsUUID()
  offerId: string;
}
