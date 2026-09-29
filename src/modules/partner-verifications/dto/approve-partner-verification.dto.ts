import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class ApprovePartnerVerificationDto {
  /**
   * How the student reached the approve screen.
   *  - 'push' (default): opened from a notification / link. Requires the number-matching code.
   *  - 'qr': scanned in-app from the partner's screen, which already proves presence.
   */
  @IsOptional()
  @IsIn(['push', 'qr'])
  method?: 'push' | 'qr';

  /** The code the student picked (must equal the one shown on the partner's screen). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  matchCode?: string;
}
