import { BadRequestException } from '@nestjs/common';
import { VERIFICATION_STATUS } from '../../../constants/app.constants';
import {
  OPERATORS_BY_TYPE,
  StudentFilterClause,
  StudentFilterFieldDefinition,
  StudentFilterFieldType,
  StudentFilterOperator,
} from './student-filter.types';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const PLATFORM_OPTIONS = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'web', label: 'Web' },
];

const KYC_STATUS_OPTIONS = [
  { value: VERIFICATION_STATUS.PENDING, label: 'Pending' },
  { value: VERIFICATION_STATUS.APPROVED, label: 'Approved' },
  { value: VERIFICATION_STATUS.REJECTED, label: 'Rejected' },
  { value: VERIFICATION_STATUS.EXPIRED, label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
];

export const STUDENT_FILTER_FIELDS: StudentFilterFieldDefinition[] = [
  {
    key: 'gender',
    label: 'Gender',
    type: 'enum',
    operators: OPERATORS_BY_TYPE.enum,
    enumOptions: GENDER_OPTIONS,
  },
  {
    key: 'university',
    label: 'University',
    type: 'string',
    operators: OPERATORS_BY_TYPE.string,
  },
  {
    key: 'graduation_year',
    label: 'Graduation Year',
    type: 'number',
    operators: OPERATORS_BY_TYPE.number,
  },
  {
    key: 'platform',
    label: 'Platform',
    type: 'enum',
    operators: OPERATORS_BY_TYPE.enum,
    enumOptions: PLATFORM_OPTIONS,
  },
  {
    key: 'is_founders_club',
    label: 'Founders Club',
    type: 'boolean',
    operators: OPERATORS_BY_TYPE.boolean,
  },
  {
    key: 'verification_status',
    label: 'KYC Status',
    type: 'enum',
    operators: OPERATORS_BY_TYPE.enum,
    enumOptions: KYC_STATUS_OPTIONS,
  },
  {
    key: 'created_at',
    label: 'Signup Date',
    type: 'date',
    operators: OPERATORS_BY_TYPE.date,
  },
  {
    key: 'date_of_birth',
    label: 'Date of Birth',
    type: 'date',
    operators: OPERATORS_BY_TYPE.date,
  },
  {
    key: 'degree',
    label: 'Degree',
    type: 'string',
    operators: OPERATORS_BY_TYPE.string,
  },
  {
    key: 'year_of_study',
    label: 'Year of Study',
    type: 'string',
    operators: OPERATORS_BY_TYPE.string,
  },
  {
    key: 'city',
    label: 'City',
    type: 'string',
    operators: OPERATORS_BY_TYPE.string,
  },
  {
    key: 'lifetime_redemptions',
    label: 'Redemption Count',
    type: 'number',
    operators: OPERATORS_BY_TYPE.number,
  },
  {
    key: 'redemption_merchant',
    label: 'Redeemed at Merchant',
    type: 'nested',
    operators: ['equals', 'contains'],
    nested: true,
  },
  {
    key: 'redemption_category',
    label: 'Redeemed Category',
    type: 'nested',
    operators: OPERATORS_BY_TYPE.string,
    nested: true,
  },
  {
    key: 'redemption_subcategory',
    label: 'Redeemed Subcategory',
    type: 'nested',
    operators: OPERATORS_BY_TYPE.string,
    nested: true,
  },
  {
    key: 'redemption_date',
    label: 'Redemption Date',
    type: 'nested',
    operators: OPERATORS_BY_TYPE.date,
    nested: true,
  },
];

const FIELD_MAP = new Map(
  STUDENT_FILTER_FIELDS.map((f) => [f.key, f]),
);

export function getStudentFilterField(
  key: string,
): StudentFilterFieldDefinition | undefined {
  return FIELD_MAP.get(key);
}

export function getStudentFilterFieldsMetadata(): StudentFilterFieldDefinition[] {
  return STUDENT_FILTER_FIELDS;
}

export function validateStudentFilterClause(
  clause: StudentFilterClause,
): void {
  const fieldDef = getStudentFilterField(clause.field);
  if (!fieldDef) {
    throw new BadRequestException(`Unknown filter field: ${clause.field}`);
  }

  if (!fieldDef.operators.includes(clause.operator)) {
    throw new BadRequestException(
      `Operator "${clause.operator}" is not allowed for field "${clause.field}"`,
    );
  }

  if (fieldDef.type === 'boolean') {
    return;
  }

  if (clause.value === undefined || clause.value === null) {
    throw new BadRequestException(
      `Value is required for filter field "${clause.field}"`,
    );
  }

  if (clause.operator === 'between') {
    const arr = normalizeToArray(clause.value);
    if (arr.length !== 2) {
      throw new BadRequestException(
        `"between" operator requires exactly two values for field "${clause.field}"`,
      );
    }
  }

  if (clause.operator === 'in') {
    const arr = normalizeToArray(clause.value);
    if (arr.length === 0) {
      throw new BadRequestException(
        `"in" operator requires at least one value for field "${clause.field}"`,
      );
    }
  }
}

export function validateStudentFilterClauses(
  clauses: StudentFilterClause[],
): void {
  for (const clause of clauses) {
    validateStudentFilterClause(clause);
  }
}

export function normalizeToArray(
  value: string | string[] | number | boolean,
): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [String(value)];
}

export function getFieldType(key: string): StudentFilterFieldType {
  const field = getStudentFilterField(key);
  if (!field) {
    throw new BadRequestException(`Unknown filter field: ${key}`);
  }
  return field.type;
}

export function isAllowedOperator(
  field: string,
  operator: StudentFilterOperator,
): boolean {
  const fieldDef = getStudentFilterField(field);
  return fieldDef?.operators.includes(operator) ?? false;
}
