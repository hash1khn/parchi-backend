import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import type { StudentFilterOperator } from './student-filter.types';

export class StudentFilterClauseDto {
  @IsString()
  @IsNotEmpty()
  field: string;

  @IsString()
  @IsNotEmpty()
  operator: StudentFilterOperator;

  @IsOptional()
  @ValidateIf((o) => !['is_true', 'is_false'].includes(o.operator))
  value?: string | string[] | number | boolean;
}
