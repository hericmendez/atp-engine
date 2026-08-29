export type DatePrecision = 'year' | 'month' | 'day';

export interface ReleaseDate {
  readonly year: number;
  readonly month: number | null;
  readonly day: number | null;
  readonly precision: DatePrecision;
}

export function createReleaseDate(year: number, month?: number, day?: number): ReleaseDate {
  if (!Number.isInteger(year) || year < 1950 || year > 2100) {
    throw new Error(`Invalid release year: ${year}`);
  }

  if (month !== undefined && month !== null) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error(`Invalid release month: ${month}`);
    }
  }

  if (day !== undefined && day !== null) {
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error(`Invalid release day: ${day}`);
    }
  }

  const hasMonth = month !== undefined && month !== null;
  const hasDay = day !== undefined && day !== null;

  return {
    year,
    month: hasMonth ? month : null,
    day: hasDay ? day : null,
    precision: hasDay ? 'day' : hasMonth ? 'month' : 'year',
  };
}

export function releaseDateEquals(a: ReleaseDate, b: ReleaseDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
