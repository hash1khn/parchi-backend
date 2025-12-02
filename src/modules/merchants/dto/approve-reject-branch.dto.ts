import { IsNotEmpty, IsString, IsIn } from 'class-validator';

export class ApproveRejectBranchDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['approved', 'rejected'], {
    message: 'Action must be either "approved" or "rejected"',
  })
  action: 'approved' | 'rejected';
}

