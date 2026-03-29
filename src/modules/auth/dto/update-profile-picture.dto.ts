import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateProfilePictureDto {
  @IsString()
  @IsNotEmpty()
  imageUrl: string;
}