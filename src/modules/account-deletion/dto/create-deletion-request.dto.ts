import { IsBoolean, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateDeletionRequestDto {
    @IsString()
    @IsNotEmpty()
    identifier: string;

    @IsString()
    @MinLength(10)
    reason: string;

    @IsBoolean()
    confirm: boolean;
}
