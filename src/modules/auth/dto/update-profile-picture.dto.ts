import { IsString, IsUrl, IsNotEmpty } from 'class-validator';

export class UpdateProfilePictureDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  imageUrl: string;
}