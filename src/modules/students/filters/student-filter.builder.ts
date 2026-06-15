import { Prisma } from '@prisma/client';
import { VerificationStatus } from '../../../constants/app.constants';
import { StudentFilterClause } from './student-filter.types';
import { normalizeToArray } from './student-filter.registry';

const REJECTED_REDEMPTION_FILTER: Prisma.redemptionsWhereInput = {
  OR: [
    { notes: null },
    { notes: { not: { startsWith: 'REJECTED' } } },
  ],
};

function parseDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function buildDateFilter(
  operator: string,
  value: string | string[] | number | boolean,
  column: 'created_at' | 'date_of_birth',
): Prisma.studentsWhereInput {
  if (operator === 'before') {
    return { [column]: { lt: parseDate(String(value)) } };
  }
  if (operator === 'after') {
    return { [column]: { gt: parseDate(String(value)) } };
  }
  if (operator === 'between') {
    const [from, to] = normalizeToArray(value);
    return {
      [column]: {
        gte: parseDate(from),
        lte: endOfDay(parseDate(to)),
      },
    };
  }
  throw new Error(`Unsupported date operator: ${operator}`);
}

function buildStringFilter(
  operator: string,
  value: string | string[] | number | boolean,
  column: string,
): Prisma.studentsWhereInput {
  const strVal = String(value);
  switch (operator) {
    case 'equals':
      return { [column]: { equals: strVal, mode: 'insensitive' } };
    case 'not_equals':
      return { NOT: { [column]: { equals: strVal, mode: 'insensitive' } } };
    case 'contains':
      return { [column]: { contains: strVal, mode: 'insensitive' } };
    case 'in':
      return {
        [column]: {
          in: normalizeToArray(value),
          mode: 'insensitive',
        },
      };
    default:
      throw new Error(`Unsupported string operator: ${operator}`);
  }
}

function buildNumberFilter(
  operator: string,
  value: string | string[] | number | boolean,
  column: string,
): Prisma.studentsWhereInput {
  if (operator === 'between') {
    const [min, max] = normalizeToArray(value).map(Number);
    return { [column]: { gte: min, lte: max } };
  }

  const num = Number(value);
  switch (operator) {
    case 'eq':
      return { [column]: num };
    case 'neq':
      return { NOT: { [column]: num } };
    case 'gt':
      return { [column]: { gt: num } };
    case 'lt':
      return { [column]: { lt: num } };
    case 'gte':
      return { [column]: { gte: num } };
    case 'lte':
      return { [column]: { lte: num } };
    default:
      throw new Error(`Unsupported number operator: ${operator}`);
  }
}

function buildCityFilter(
  operator: string,
  value: string | string[] | number | boolean,
): Prisma.studentsWhereInput {
  const city = String(value).trim();
  if (operator === 'equals') {
    return {
      OR: [
        { university: { endsWith: `, ${city}`, mode: 'insensitive' } },
        { university: { equals: city, mode: 'insensitive' } },
      ],
    };
  }
  if (operator === 'contains') {
    return { university: { contains: city, mode: 'insensitive' } };
  }
  if (operator === 'not_equals') {
    return {
      NOT: {
        OR: [
          { university: { endsWith: `, ${city}`, mode: 'insensitive' } },
          { university: { equals: city, mode: 'insensitive' } },
        ],
      },
    };
  }
  if (operator === 'in') {
    const cities = normalizeToArray(value);
    return {
      OR: cities.flatMap((c) => [
        { university: { endsWith: `, ${c}`, mode: 'insensitive' } },
        { university: { equals: c, mode: 'insensitive' } },
      ]),
    };
  }
  throw new Error(`Unsupported city operator: ${operator}`);
}

function buildVerificationStatusFilter(
  operator: string,
  value: string | string[] | number | boolean,
): Prisma.studentsWhereInput {
  const values = operator === 'in'
    ? normalizeToArray(value)
    : [String(value)];

  const enumStatuses = values.filter((s) => s !== 'suspended') as VerificationStatus[];
  const hasSuspended = values.includes('suspended');

  const conditions: Prisma.studentsWhereInput[] = [];

  if (enumStatuses.length > 0) {
    if (operator === 'not_equals') {
      conditions.push({ verification_status: { notIn: enumStatuses } });
    } else if (operator === 'equals') {
      conditions.push({ verification_status: enumStatuses[0] });
    } else {
      conditions.push({ verification_status: { in: enumStatuses } });
    }
  }

  if (hasSuspended) {
    conditions.push({ users: { is_active: false } });
  }

  if (conditions.length === 1) {
    return conditions[0];
  }
  return { OR: conditions };
}

function buildBooleanFilter(
  operator: string,
  column: string,
): Prisma.studentsWhereInput {
  const boolVal = operator === 'is_true';
  return { [column]: boolVal };
}

function buildRedemptionDateNested(
  operator: string,
  value: string | string[] | number | boolean,
): Prisma.studentsWhereInput {
  let dateCond: Prisma.DateTimeFilter = {};

  if (operator === 'before') {
    dateCond = { lt: parseDate(String(value)) };
  } else if (operator === 'after') {
    dateCond = { gt: parseDate(String(value)) };
  } else if (operator === 'between') {
    const [from, to] = normalizeToArray(value);
    dateCond = {
      gte: parseDate(from),
      lte: endOfDay(parseDate(to)),
    };
  }

  return {
    redemptions: {
      some: {
        AND: [
          { created_at: dateCond },
          REJECTED_REDEMPTION_FILTER,
        ],
      },
    },
  };
}

function buildRedemptionMerchantNested(
  operator: string,
  value: string | string[] | number | boolean,
): Prisma.studentsWhereInput {
  const strVal = String(value);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strVal);

  let merchantFilter: Prisma.merchantsWhereInput;
  if (operator === 'equals' && isUuid) {
    merchantFilter = { id: strVal };
  } else if (operator === 'contains') {
    merchantFilter = { business_name: { contains: strVal, mode: 'insensitive' } };
  } else {
    merchantFilter = { business_name: { equals: strVal, mode: 'insensitive' } };
  }

  return {
    redemptions: {
      some: {
        AND: [
          { offers: { merchants: merchantFilter } },
          REJECTED_REDEMPTION_FILTER,
        ],
      },
    },
  };
}

function buildRedemptionCategoryNested(
  operator: string,
  value: string | string[] | number | boolean,
  column: 'category' | 'sub_category',
): Prisma.studentsWhereInput {
  let merchantFilter: Prisma.merchantsWhereInput;

  switch (operator) {
    case 'equals':
      merchantFilter = { [column]: { equals: String(value), mode: 'insensitive' } };
      break;
    case 'not_equals':
      merchantFilter = { NOT: { [column]: { equals: String(value), mode: 'insensitive' } } };
      break;
    case 'contains':
      merchantFilter = { [column]: { contains: String(value), mode: 'insensitive' } };
      break;
    case 'in':
      merchantFilter = {
        [column]: { in: normalizeToArray(value), mode: 'insensitive' },
      };
      break;
    default:
      throw new Error(`Unsupported operator for redemption category: ${operator}`);
  }

  return {
    redemptions: {
      some: {
        AND: [
          { offers: { merchants: merchantFilter } },
          REJECTED_REDEMPTION_FILTER,
        ],
      },
    },
  };
}

function buildDirectFilterClause(
  clause: StudentFilterClause,
): Prisma.studentsWhereInput {
  const { field, operator, value } = clause;

  switch (field) {
    case 'gender':
    case 'university':
    case 'degree':
    case 'year_of_study':
    case 'platform':
      return buildStringFilter(operator, value!, field);

    case 'graduation_year':
    case 'lifetime_redemptions':
      return buildNumberFilter(operator, value!, field);

    case 'created_at':
      return buildDateFilter(operator, value!, 'created_at');

    case 'date_of_birth':
      return buildDateFilter(operator, value!, 'date_of_birth');

    case 'city':
      return buildCityFilter(operator, value!);

    case 'verification_status':
      return buildVerificationStatusFilter(operator, value!);

    case 'is_founders_club':
      return buildBooleanFilter(operator, 'is_founders_club');

    case 'redemption_date':
      return buildRedemptionDateNested(operator, value!);

    case 'redemption_merchant':
      return buildRedemptionMerchantNested(operator, value!);

    case 'redemption_category':
      return buildRedemptionCategoryNested(operator, value!, 'category');

    case 'redemption_subcategory':
      return buildRedemptionCategoryNested(operator, value!, 'sub_category');

    default:
      throw new Error(`Unhandled filter field: ${field}`);
  }
}

export function buildStudentFilterWhere(
  clauses: StudentFilterClause[],
): Prisma.studentsWhereInput[] {
  return clauses.map((clause) => buildDirectFilterClause(clause));
}
