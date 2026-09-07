const NUMERIC_DATE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/;
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const NAMED_DATE =
  /^(\d{1,2})\s+([A-Za-z]+)\.?[,\s]+(\d{2,4})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeYear(year: number): number {
  if (year < 100) {
    return year + 2000;
  }
  return year;
}

function formatDate(day: number, month: number, year: number): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }
  return `${pad(day)}/${pad(month)}/${normalizeYear(year)}`;
}

export function parsePkDate(raw: string): string | null {
  const value = raw.trim();
  const numeric = value.match(NUMERIC_DATE);
  if (numeric) {
    return formatDate(
      Number(numeric[1]),
      Number(numeric[2]),
      Number(numeric[3]),
    );
  }

  const named = value.match(NAMED_DATE);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (!month) {
      return null;
    }
    return formatDate(Number(named[1]), month, Number(named[3]));
  }

  return null;
}

export function looksLikeDate(raw: string): boolean {
  return parsePkDate(raw) !== null;
}
