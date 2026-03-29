import { IsString, IsOptional } from 'class-validator';

export class UpdateProfilePictureDto {
  @IsString()
  @IsOptional()
  imageUrl?: string;
}