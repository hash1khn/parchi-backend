import { IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveSelfieChangeDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  adminNote?: string;
}
