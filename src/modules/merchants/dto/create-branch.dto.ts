import {
    IsNotEmpty,
    IsOptional,
    IsString,
    IsBoolean,
    IsLatitude,
    IsLongitude,
} from 'class-validator';

export class CreateBranchDto {
    @IsNotEmpty()
    @IsString()
    branchName: string;

    @IsNotEmpty()
    @IsString()
    address: string;

    @IsNotEmpty()
    @IsString()
    city: string;

    @IsOptional()
    @IsString()
    contactPhone?: string;

    @IsOptional()
    @IsLatitude()
    latitude?: number;

    @IsOptional()
    @IsLongitude()
    longitude?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
