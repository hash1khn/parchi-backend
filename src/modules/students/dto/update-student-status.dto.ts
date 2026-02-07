import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateStudentStatusDto {
    @IsBoolean()
    @IsNotEmpty()
    isActive: boolean;

    @IsOptional()
    @IsString()
    reason?: string;
}
