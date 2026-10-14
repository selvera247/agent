-- MySQL mock warehouse for FinDataGraph live Sources
CREATE DATABASE IF NOT EXISTS findatagraph_mock;
USE findatagraph_mock;

DROP VIEW IF EXISTS findatagraph_commercial_v;
DROP VIEW IF EXISTS findatagraph_gl_v;

CREATE VIEW findatagraph_commercial_v AS
SELECT * FROM (
  SELECT 'INV-1001' AS external_id, 'US-EAST' AS entity_code, 'INV-1001' AS document_number,
         'Acme Stores' AS counterparty, DATE('2026-09-03') AS document_date, 125000.00 AS amount, 'USD' AS currency
  UNION ALL SELECT 'INV-1002','US-EAST','INV-1002','Northwind',DATE('2026-09-05'),48250.50,'USD'
  UNION ALL SELECT 'INV-1003','US-WEST','INV-1003','Contoso',DATE('2026-09-08'),91000.00,'USD'
  UNION ALL SELECT 'INV-M-BREAK','US-EAST','INV-M-BREAK','Break Co',DATE('2026-09-10'),5000.00,'USD'
) t;

CREATE VIEW findatagraph_gl_v AS
SELECT * FROM (
  SELECT 'gl-INV-1001' AS external_id, 'US-EAST' AS entity_code, 'INV-1001' AS reference,
         '4000' AS account_code, DATE('2026-09-04') AS posting_date, 125000.00 AS amount, 'USD' AS currency
  UNION ALL SELECT 'gl-INV-1002','US-EAST','INV-1002','4000',DATE('2026-09-06'),48000.00,'USD'  -- amount mismatch
  UNION ALL SELECT 'gl-INV-1003','US-WEST','INV-1003','4000',DATE('2026-09-09'),91000.00,'USD'
  -- INV-M-BREAK missing in GL on purpose
) t;
