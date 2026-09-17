import { Prisma } from '../generated/prisma/client';
export function paymentRisk(currentDays:number,historyDays:number,observations:number,overdueCents:number) {
  const days=Math.max(currentDays,historyDays);
  return {color:days>7?'RED':days>0?'YELLOW':observations>0?'GREEN':'GRAY',currentDays,historyDays,observations,overdueCents,windowDays:90};
}
// Calendar-day lateness. Partial payments remain overdue until the quota is complete.
// Cancelled loans keep recent historical lateness, but have no collectible balance.
export function riskCte(today:string) {
  return Prisma.sql`WITH quotas AS (
    SELECT l.client_id,i.id,i.due_date,i.amount_cents,
      (l.deleted_at AT TIME ZONE 'America/Mexico_City')::date AS cancelled,
      COALESCE(SUM(a.amount_cents),0) AS paid,MAX(p.paid_on) AS completed
    FROM loan_installments i JOIN loans l ON l.id=i.loan_id
    LEFT JOIN payment_allocations a ON a.installment_id=i.id AND EXISTS (SELECT 1 FROM payments valid WHERE valid.id=a.payment_id AND valid.cancelled_at IS NULL)
    LEFT JOIN payments p ON p.id=a.payment_id
    GROUP BY l.client_id,l.deleted_at,i.id
  ), stats AS (
    SELECT client_id,
      COALESCE(MAX(GREATEST(${today}::date-due_date,0)) FILTER(WHERE paid<amount_cents AND cancelled IS NULL),0)::integer AS current_days,
      COALESCE(MAX(GREATEST(CASE WHEN paid>=amount_cents THEN completed ELSE cancelled END-due_date,0)) FILTER(
        WHERE (paid>=amount_cents AND completed>=${today}::date-90) OR (paid<amount_cents AND cancelled>=${today}::date-90)),0)::integer AS history_days,
      COUNT(*) FILTER(WHERE (paid>=amount_cents AND completed>=${today}::date-90) OR (paid<amount_cents AND due_date<${today}::date AND cancelled IS NULL) OR (cancelled>=${today}::date-90 AND due_date<cancelled))::integer AS observations,
      COALESCE(SUM(amount_cents-paid) FILTER(WHERE due_date<${today}::date AND cancelled IS NULL),0)::float8 AS overdue_cents
    FROM quotas GROUP BY client_id
  ), risk AS (
    SELECT c.id,COALESCE(s.current_days,0) AS current_days,COALESCE(s.history_days,0) AS history_days,
      COALESCE(s.observations,0) AS observations,COALESCE(s.overdue_cents,0) AS overdue_cents,
      CASE WHEN GREATEST(s.current_days,s.history_days)>7 THEN 'RED' WHEN GREATEST(s.current_days,s.history_days)>0 THEN 'YELLOW' WHEN s.observations>0 THEN 'GREEN' ELSE 'GRAY' END AS color
    FROM clients c LEFT JOIN stats s ON s.client_id=c.id
  )`;
}
