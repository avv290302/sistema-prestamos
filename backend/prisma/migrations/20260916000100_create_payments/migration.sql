BEGIN;
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'OTHER');
CREATE TABLE "payments" (
  "id" UUID NOT NULL, "request_id" UUID NOT NULL, "loan_id" UUID NOT NULL, "created_by_id" UUID NOT NULL,
  "amount_cents" INTEGER NOT NULL, "paid_on" DATE NOT NULL, "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "notes" VARCHAR(500), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_amount_check" CHECK ("amount_cents" > 0)
);
CREATE TABLE "payment_allocations" (
  "id" UUID NOT NULL, "payment_id" UUID NOT NULL, "installment_id" UUID NOT NULL, "amount_cents" INTEGER NOT NULL,
  CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_allocations_amount_check" CHECK ("amount_cents" > 0)
);
CREATE UNIQUE INDEX "payments_request_id_key" ON "payments"("request_id");
CREATE INDEX "payments_loan_id_paid_on_idx" ON "payments"("loan_id", "paid_on");
CREATE INDEX "payments_created_by_id_idx" ON "payments"("created_by_id");
CREATE INDEX "payments_created_at_id_idx" ON "payments"("created_at", "id");
CREATE UNIQUE INDEX "payment_allocations_payment_id_installment_id_key" ON "payment_allocations"("payment_id", "installment_id");
CREATE INDEX "payment_allocations_installment_id_idx" ON "payment_allocations"("installment_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "loan_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
