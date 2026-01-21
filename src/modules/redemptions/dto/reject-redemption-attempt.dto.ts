import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class RejectRedemptionAttemptDto {
    @IsNotEmpty()
    @IsString()
    parchiId: string;

    @IsNotEmpty()
    @IsUUID()
    offerId: string;

    @IsNotEmpty()
    @IsString()
    rejectionReason: string;
}
