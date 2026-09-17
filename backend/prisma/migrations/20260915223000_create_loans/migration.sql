BEGIN;
CREATE TABLE "loans" (
  "id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "principal_cents" INTEGER NOT NULL,
  "interest_cents" INTEGER NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "weekly_cents" INTEGER NOT NULL,
  "first_payment_date" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loans_amounts_check" CHECK ("principal_cents" > 0 AND "interest_cents" >= 0 AND "weekly_cents" > 0 AND "total_cents" = "principal_cents" + "interest_cents")
);
CREATE TABLE "loan_installments" (
  "id" UUID NOT NULL,
  "loan_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "due_date" DATE NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  CONSTRAINT "loan_installments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loan_installments_values_check" CHECK ("number" BETWEEN 1 AND 14 AND "amount_cents" > 0)
);
CREATE UNIQUE INDEX "loans_request_id_key" ON "loans"("request_id");
CREATE INDEX "loans_client_id_idx" ON "loans"("client_id");
CREATE INDEX "loans_created_by_id_idx" ON "loans"("created_by_id");
CREATE INDEX "loans_created_at_id_idx" ON "loans"("created_at", "id");
CREATE UNIQUE INDEX "loan_installments_loan_id_number_key" ON "loan_installments"("loan_id", "number");
CREATE INDEX "loan_installments_due_date_idx" ON "loan_installments"("due_date");
ALTER TABLE "loans" ADD CONSTRAINT "loans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loans" ADD CONSTRAINT "loans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
