import { IsBoolean } from 'class-validator';

export class UpdateQrSettingsDto {
  @IsBoolean()
  qrAutoApprove: boolean;
}
