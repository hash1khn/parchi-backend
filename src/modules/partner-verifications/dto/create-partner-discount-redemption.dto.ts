import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const NO_CONTROL_CHARS = /^[^\u0000-\u001F\u007F]+$/;
/** Matches Postgres DECIMAL(12, 2). */
const MAX_MONEY_PKR = 9_999_999_999.99;

export class CreatePartnerDiscountRedemptionDto {
  @IsUUID()
  verificationRequestId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @Matches(NO_CONTROL_CHARS, { message: 'externalReference contains invalid characters' })
  externalReference: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'parchiId must be 1-10 letters or digits' })
  parchiId: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY_PKR)
  discountAmountPkr: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY_PKR)
  orderTotalPkr?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(NO_CONTROL_CHARS, { message: 'eventLabel contains invalid characters' })
  eventLabel?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
