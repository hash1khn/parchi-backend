export type StudentFilterFieldType =
  | 'string'
  | 'enum'
  | 'number'
  | 'date'
  | 'boolean'
  | 'nested';

export type StringOperator = 'equals' | 'not_equals' | 'in' | 'contains';
export type NumberOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
export type DateOperator = 'before' | 'after' | 'between';
export type BooleanOperator = 'is_true' | 'is_false';

export type StudentFilterOperator =
  | StringOperator
  | NumberOperator
  | DateOperator
  | BooleanOperator;

export interface StudentFilterClause {
  field: string;
  operator: StudentFilterOperator;
  value?: string | string[] | number | boolean;
}

export interface StudentFilterFieldDefinition {
  key: string;
  label: string;
  type: StudentFilterFieldType;
  operators: StudentFilterOperator[];
  enumOptions?: { value: string; label: string }[];
  nested?: boolean;
}

export const OPERATORS_BY_TYPE: Record<
  StudentFilterFieldType,
  StudentFilterOperator[]
> = {
  string: ['equals', 'not_equals', 'in', 'contains'],
  enum: ['equals', 'not_equals', 'in', 'contains'],
  number: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'between'],
  date: ['before', 'after', 'between'],
  boolean: ['is_true', 'is_false'],
  nested: ['equals', 'not_equals', 'in', 'contains', 'before', 'after', 'between'],
};
