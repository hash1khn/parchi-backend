import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// No ASCII control characters (incl. newlines) in partner-controlled text: it is
// rendered inside push notifications and the approve screen.
const NO_CONTROL_CHARS = /^[^\u0000-\u001F\u007F]+$/;

export class CreatePartnerVerificationDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'parchiId must be 1-10 letters or digits' })
  parchiId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @Matches(NO_CONTROL_CHARS, { message: 'externalReference contains invalid characters' })
  externalReference: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(NO_CONTROL_CHARS, { message: 'eventLabel contains invalid characters' })
  eventLabel?: string;
}
