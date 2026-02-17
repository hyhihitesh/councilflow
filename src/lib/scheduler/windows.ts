export function toUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function toUtcIsoWeekStartKey(date: Date) {
  const cursor = new Date(date);
  const day = cursor.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  cursor.setUTCDate(cursor.getUTCDate() + diffToMonday);
  cursor.setUTCHours(0, 0, 0, 0);
  return toUtcDateKey(cursor);
}

export function isUtcWednesday(date: Date) {
  return date.getUTCDay() === 3;
}
