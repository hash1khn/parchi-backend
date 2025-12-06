import { IsNotEmpty, IsString, IsIn, IsOptional } from 'class-validator';

export class ApproveRejectOfferDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['approve', 'reject'], {
    message: 'Action must be either "approve" or "reject"',
  })
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  notes?: string;
}

