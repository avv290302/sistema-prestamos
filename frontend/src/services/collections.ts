import { request } from './auth';
export type CollectionFilter = 'OVERDUE' | 'TODAY' | 'NEXT_7' | 'ALL';
export interface CollectionItem {
  id: string; loanId: string; number: number; installmentCount: number; dueDate: string;
  amountCents: number; paidCents: number; balanceCents: number; daysOverdue: number;
  status: 'OVERDUE' | 'TODAY' | 'UPCOMING';
  client: { id: string; fullName: string; phone: string; address: string; isActive: boolean };
}
export interface CollectionsResponse {
  asOf: string; timeZone: string; nextSevenDaysThrough: string;
  summary: { overdueCents: number; overdueCount: number; todayCents: number; todayCount: number; nextSevenDaysCents: number; nextSevenDaysCount: number; outstandingCents: number; pendingCount: number; loanCount: number };
  items: CollectionItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
export async function listCollections(status: CollectionFilter, search: string, page: number, signal: AbortSignal): Promise<CollectionsResponse> {
  const query = new URLSearchParams({ status, search, page: String(page), limit: '20' });
  return (await request(`/collections?${query}`, { signal })).json();
}
