import { collectionDateRange, collectionSearchPattern } from './collections.helpers';
describe('collection calendar', () => {
  it('spans a year boundary', () => { expect(collectionDateRange('2026-12-29').nextSevenDays).toBe('2027-01-05'); });
  it('spans leap day', () => { expect(collectionDateRange('2028-02-25').nextSevenDays).toBe('2028-03-03'); });
  it('includes exactly seven future dates', () => { expect(collectionDateRange('2026-09-15')).toEqual({ today: '2026-09-15', nextSevenDays: '2026-09-22' }); });
});
describe('literal collection search', () => {
  it('escapes wildcards and backslashes', () => { expect(collectionSearchPattern('50%_\\')).toBe('%50\\%\\_\\\\%'); });
  it('keeps ordinary names intact', () => { expect(collectionSearchPattern("José O'Neil")).toBe("%José O'Neil%"); });
  it('allows an empty search', () => { expect(collectionSearchPattern()).toBe('%%'); });
});
