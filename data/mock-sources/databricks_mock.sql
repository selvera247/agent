-- Databricks SQL warehouse mock views for FinDataGraph live Sources

CREATE OR REPLACE VIEW findatagraph_commercial_v AS
SELECT * FROM VALUES
  ('INV-1001','US-EAST','INV-1001','Acme Stores','2026-09-03',125000.00,'USD'),
  ('INV-1002','US-EAST','INV-1002','Northwind','2026-09-05',48250.50,'USD'),
  ('INV-1003','US-WEST','INV-1003','Contoso','2026-09-08',91000.00,'USD'),
  ('INV-DBX-BREAK','US-EAST','INV-DBX-BREAK','Break Co','2026-09-10',5000.00,'USD')
  AS t(external_id, entity_code, document_number, counterparty, document_date, amount, currency);

CREATE OR REPLACE VIEW findatagraph_gl_v AS
SELECT * FROM VALUES
  ('gl-INV-1001','US-EAST','INV-1001','4000','2026-09-04',125000.00,'USD'),
  ('gl-INV-1002','US-EAST','INV-1002','4000','2026-09-06',48000.00,'USD'),
  ('gl-INV-1003','US-WEST','INV-1003','4000','2026-09-09',91000.00,'USD')
  AS t(external_id, entity_code, reference, account_code, posting_date, amount, currency);
