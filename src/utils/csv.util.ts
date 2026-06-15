/**
 * Escape a cell value for RFC 4180 CSV output.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = value instanceof Date
    ? value.toISOString()
    : String(value);

  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert an array of row objects to a CSV string.
 */
export function rowsToCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvCell(row[h])).join(','),
  );
  return [headerLine, ...dataLines].join('\n');
}
