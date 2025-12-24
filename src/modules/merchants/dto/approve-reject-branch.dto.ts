import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import {
  APPROVE_REJECT_ACTION,
  type ApproveRejectAction,
} from '../../../constants/app.constants';

export class ApproveRejectBranchDto {
  @IsNotEmpty()
  @IsString()
  @IsEnum(APPROVE_REJECT_ACTION, {
    message: `Action must be one of: ${Object.values(APPROVE_REJECT_ACTION).join(', ')}`,
  })
  action: ApproveRejectAction;
}

