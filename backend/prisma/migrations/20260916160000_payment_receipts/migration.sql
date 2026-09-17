ALTER TABLE payments ADD COLUMN receipt_snapshot JSONB;
ALTER TABLE app_settings ADD COLUMN business_phone VARCHAR(30) NOT NULL DEFAULT '', ADD COLUMN business_address VARCHAR(300) NOT NULL DEFAULT '', ADD COLUMN receipt_footer VARCHAR(300) NOT NULL DEFAULT 'Gracias por su pago.';
