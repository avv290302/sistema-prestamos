import { buildPeriodReport, reportRange } from './reports.helpers';
describe('report ranges', () => {
  const today = '2026-09-15';
  it('defaults to the current month to date', () => { expect(reportRange(undefined,undefined,today)).toEqual({ from:'2026-09-01',to:today,days:15,previousFrom:'2026-08-17',previousTo:'2026-08-31' }); });
  it('supports a single day and leap years', () => { expect(reportRange('2024-02-29','2024-02-29',today).days).toBe(1); });
  it.each([['2026-02-30',today],['2026-09-16',today],['2026-09-01','2026-09-16'],['2025-01-01',today]])('rejects invalid range %s to %s', (from,to) => { expect(() => reportRange(from,to,today)).toThrow(); });
});
describe('report aggregation', () => {
  const range = reportRange('2026-09-01','2026-09-07','2026-09-15');
  const loans = [{date:'2026-09-01',principalCents:1000000,interestCents:400000,count:1},{date:'2026-08-31',principalCents:500000,interestCents:200000,count:1}];
  const payments = [{date:'2026-09-07',collectedCents:150000,count:2},{date:'2026-08-31',collectedCents:50000,count:1}];
  it('separates current and equal-length previous period', () => {
    const report = buildPeriodReport(range,loans,payments,'DAY');
    expect(report.current.principalCents).toBe(1000000); expect(report.current.collectedCents).toBe(150000);
    expect(report.previous.principalCents).toBe(500000); expect(report.previous.collectedCents).toBe(50000);
  });
  it('includes zero-activity dates and boundary dates', () => {
    const {series} = buildPeriodReport(range,loans,payments,'DAY');
    expect(series).toHaveLength(7); expect(series[1].principalCents).toBe(0); expect(series[6].collectedCents).toBe(150000);
  });
  it.each(['DAY','WEEK','MONTH'] as const)('preserves totals when grouped by %s', group => {
    const report = buildPeriodReport(range,loans,payments,group);
    expect(report.series.reduce((sum,row) => sum+row.principalCents,0)).toBe(report.current.principalCents);
    expect(report.series.reduce((sum,row) => sum+row.collectedCents,0)).toBe(report.current.collectedCents);
  });
  it('uses Monday for weeks', () => { expect(buildPeriodReport(range,loans,payments,'WEEK').series[0].date).toBe('2026-08-31'); });
  it('returns usable zero totals for an empty period', () => { expect(buildPeriodReport(range,[],[],'MONTH').current.collectedCents).toBe(0); });
});
