// Escape LIKE metacharacters so a client search is always literal.
export function collectionSearchPattern(search = '') {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}
export function collectionDateRange(today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return { today, nextSevenDays: date.toISOString().slice(0, 10) };
}
