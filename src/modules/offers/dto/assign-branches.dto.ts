import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class AssignBranchesDto {
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  branchIds: string[];
}

