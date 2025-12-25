
import { IsString, IsOptional, IsUUID, IsNumber, Min } from 'class-validator';

export class AssignOffersDto {
  @IsUUID()
  @IsString()
  standardOfferId: string;

  @IsUUID()
  @IsString()
  @IsOptional()
  bonusOfferId?: string | null;
}
