function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Local calendar date as YYYY-MM-DD — matches the `date` (string mode) columns used throughout. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Start of today on the server's own clock — same caveat as todayIso(). */
export function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
