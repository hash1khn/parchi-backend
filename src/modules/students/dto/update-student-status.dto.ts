import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateStudentStatusDto {
    @IsBoolean()
    @IsNotEmpty()
    isActive: boolean;
}
