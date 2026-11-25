-- Un único QR por compra: los vales de un mismo pedido comparten token_qr,
-- por lo que deja de ser único (se mantiene indexado para la validación).

-- DropIndex
DROP INDEX "tickets_evento_token_qr_key";

-- CreateIndex
CREATE INDEX "tickets_evento_token_qr_idx" ON "tickets_evento"("token_qr");
