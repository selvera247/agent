-- FinDataGraph bulk mock: 120+ commercial docs + related GL with planted breaks
-- Narrative: Meridian Retail multi-entity billing vs NetSuite GL revenue
-- Entities: US-EAST, US-WEST, EU-CORE
--
-- Run in Snowsight as ACCOUNTADMIN (or a role that can write FINDATAGRAPH_MOCK.MOCK)

USE DATABASE FINDATAGRAPH_MOCK;
USE SCHEMA MOCK;

CREATE OR REPLACE TABLE findatagraph_commercial (
  external_id VARCHAR PRIMARY KEY,
  entity_code VARCHAR NOT NULL,
  document_number VARCHAR NOT NULL,
  counterparty VARCHAR NOT NULL,
  document_date DATE NOT NULL,
  amount NUMBER(18, 2) NOT NULL,
  currency VARCHAR NOT NULL
);

CREATE OR REPLACE TABLE findatagraph_gl (
  external_id VARCHAR PRIMARY KEY,
  entity_code VARCHAR NOT NULL,
  reference VARCHAR NOT NULL,
  account_code VARCHAR NOT NULL,
  posting_date DATE NOT NULL,
  amount NUMBER(18, 2) NOT NULL,
  currency VARCHAR NOT NULL
);

-- Build 120 invoice keys (INV-1001 .. INV-1120)
CREATE OR REPLACE TEMP TABLE seed_invoices AS
SELECT
  seq AS n,
  'INV-' || LPAD(TO_VARCHAR(1000 + seq), 4, '0') AS document_number,
  CASE
    WHEN MOD(seq, 3) = 1 THEN 'US-EAST'
    WHEN MOD(seq, 3) = 2 THEN 'US-WEST'
    ELSE 'EU-CORE'
  END AS entity_code,
  CASE MOD(seq, 12)
    WHEN 0 THEN 'Acme Stores'
    WHEN 1 THEN 'Northwind'
    WHEN 2 THEN 'Contoso'
    WHEN 3 THEN 'Fabrikam'
    WHEN 4 THEN 'Litware'
    WHEN 5 THEN 'Adventure Works'
    WHEN 6 THEN 'Tailspin Toys'
    WHEN 7 THEN 'Globex'
    WHEN 8 THEN 'Initech'
    WHEN 9 THEN 'Hooli'
    WHEN 10 THEN 'Umbrella Retail'
    ELSE 'Soylent Markets'
  END AS counterparty,
  DATEADD('day', seq - 1, DATE '2026-07-01') AS document_date,
  CASE
    WHEN MOD(seq, 3) = 0 THEN 'EUR'
    ELSE 'USD'
  END AS currency,
  -- Varied ticket sizes
  ROUND(
    CASE MOD(seq, 7)
      WHEN 0 THEN 1250.00 + (seq * 3.25)
      WHEN 1 THEN 4800.50 + (seq * 11.10)
      WHEN 2 THEN 9100.00 + (seq * 7.75)
      WHEN 3 THEN 15600.00 + (seq * 4.20)
      WHEN 4 THEN 33400.00 + (seq * 2.15)
      WHEN 5 THEN 720.00 + (seq * 18.40)
      ELSE 22000.00 + (seq * 5.55)
    END
  , 2) AS amount
FROM (
  SELECT SEQ4() + 1 AS seq
  FROM TABLE(GENERATOR(ROWCOUNT => 120))
);

-- Commercial staging: all 120 invoices
INSERT INTO findatagraph_commercial
SELECT
  document_number AS external_id,
  entity_code,
  document_number,
  counterparty,
  document_date,
  amount,
  currency
FROM seed_invoices;

-- GL staging with narrative breaks:
--  - most invoices match 1:1 (posting_date = invoice_date + 1)
--  - every 11th invoice: amount mismatch (-250.50)
--  - every 17th invoice: missing in GL entirely
--  - every 19th invoice: entity mismatch on GL (swap EAST/WEST)
--  - plus 8 orphan GL-only lines (missing in CRM)
INSERT INTO findatagraph_gl
SELECT
  'gl-' || document_number AS external_id,
  CASE
    WHEN MOD(n, 19) = 0 AND entity_code = 'US-EAST' THEN 'US-WEST'
    WHEN MOD(n, 19) = 0 AND entity_code = 'US-WEST' THEN 'US-EAST'
    ELSE entity_code
  END AS entity_code,
  document_number AS reference,
  CASE MOD(n, 4)
    WHEN 0 THEN '4000'  -- product revenue
    WHEN 1 THEN '4010'  -- services revenue
    WHEN 2 THEN '4020'  -- subscription revenue
    ELSE '4100'         -- other income
  END AS account_code,
  DATEADD('day', 1, document_date) AS posting_date,
  CASE
    WHEN MOD(n, 11) = 0 THEN amount - 250.50
    ELSE amount
  END AS amount,
  currency
FROM seed_invoices
WHERE MOD(n, 17) <> 0;  -- missing-in-GL breaks

-- Orphan GL lines (missing in CRM) — classic reverse breaks
INSERT INTO findatagraph_gl VALUES
  ('gl-ORPH-9001', 'US-EAST', 'ORPH-9001', '4000', '2026-09-15', 2750.00, 'USD'),
  ('gl-ORPH-9002', 'US-WEST', 'ORPH-9002', '4010', '2026-09-16', 1199.99, 'USD'),
  ('gl-ORPH-9003', 'EU-CORE', 'ORPH-9003', '4000', '2026-09-17', 6400.00, 'EUR'),
  ('gl-ORPH-9004', 'US-EAST', 'ORPH-9004', '4020', '2026-09-18', 880.00, 'USD'),
  ('gl-ORPH-9005', 'US-WEST', 'ORPH-9005', '4100', '2026-09-19', 15000.00, 'USD'),
  ('gl-ORPH-9006', 'EU-CORE', 'ORPH-9006', '4010', '2026-09-20', 320.50, 'EUR'),
  ('gl-ORPH-9007', 'US-EAST', 'ORPH-9007', '4000', '2026-09-21', 9999.00, 'USD'),
  ('gl-ORPH-9008', 'US-WEST', 'ORPH-9008', '4020', '2026-09-22', 450.25, 'USD');

-- Adapters query these view names
CREATE OR REPLACE VIEW findatagraph_commercial_v AS
SELECT external_id, entity_code, document_number, counterparty, document_date, amount, currency
FROM findatagraph_commercial;

CREATE OR REPLACE VIEW findatagraph_gl_v AS
SELECT external_id, entity_code, reference, account_code, posting_date, amount, currency
FROM findatagraph_gl;

-- Sanity / break inventory
SELECT 'commercial' AS side, COUNT(*) AS n FROM findatagraph_commercial_v
UNION ALL
SELECT 'gl', COUNT(*) FROM findatagraph_gl_v;

SELECT 'amount_mismatch_candidates' AS break_type, COUNT(*) AS n
FROM seed_invoices WHERE MOD(n, 11) = 0 AND MOD(n, 17) <> 0
UNION ALL
SELECT 'missing_in_gl', COUNT(*) FROM seed_invoices WHERE MOD(n, 17) = 0
UNION ALL
SELECT 'entity_mismatch_candidates', COUNT(*)
FROM seed_invoices WHERE MOD(n, 19) = 0 AND MOD(n, 17) <> 0
UNION ALL
SELECT 'missing_in_crm_orphans', 8;

-- Optional: peek a few breaks
SELECT c.document_number, c.amount AS crm_amt, g.amount AS gl_amt, c.amount - g.amount AS variance
FROM findatagraph_commercial c
JOIN findatagraph_gl g ON g.reference = c.document_number
WHERE ABS(c.amount - g.amount) > 0.001
ORDER BY c.document_number
LIMIT 10;
