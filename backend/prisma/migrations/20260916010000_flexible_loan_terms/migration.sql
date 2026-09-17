BEGIN;
-- Existing contracts and their installments remain unchanged.
ALTER TABLE loans
  ADD COLUMN interest_bps INTEGER NOT NULL DEFAULT 4000,
  ADD COLUMN installment_count INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN frequency VARCHAR(15) NOT NULL DEFAULT 'WEEKLY',
  ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 7,
  ADD CONSTRAINT loans_terms_check CHECK (
    interest_bps BETWEEN 0 AND 100000 AND installment_count BETWEEN 1 AND 1000
    AND interval_days BETWEEN 1 AND 365
    AND frequency IN ('DAILY','WEEKLY','FORTNIGHTLY','MONTHLY','INTERVAL','CUSTOM')
  );
ALTER TABLE loan_installments DROP CONSTRAINT loan_installments_values_check;
ALTER TABLE loan_installments ADD CONSTRAINT loan_installments_values_check
  CHECK (number BETWEEN 1 AND 1000 AND amount_cents > 0);
COMMIT;
