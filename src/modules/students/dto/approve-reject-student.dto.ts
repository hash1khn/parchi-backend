import { IsNotEmpty, IsString, IsIn, IsOptional } from 'class-validator';

export class ApproveRejectStudentDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['approve', 'reject'], {
    message: 'Action must be either "approve" or "reject"',
  })
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

