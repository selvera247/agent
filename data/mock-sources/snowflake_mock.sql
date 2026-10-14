-- Snowflake mock objects for FinDataGraph live Sources (SQL API)
-- Fix: "This session does not have a current database"
-- Run the whole script in a worksheet after picking a warehouse in the UI.

-- 1) Create (or swap) a sandbox DB/schema
CREATE DATABASE IF NOT EXISTS FINDATAGRAPH_MOCK;
CREATE SCHEMA IF NOT EXISTS FINDATAGRAPH_MOCK.MOCK;
USE DATABASE FINDATAGRAPH_MOCK;
USE SCHEMA MOCK;

-- 2) Optional: ensure your role can use a warehouse (pick one that exists)
-- USE WAREHOUSE COMPUTE_WH;

CREATE OR REPLACE VIEW findatagraph_commercial_v AS
SELECT
  column1::VARCHAR AS external_id,
  column2::VARCHAR AS entity_code,
  column3::VARCHAR AS document_number,
  column4::VARCHAR AS counterparty,
  column5::DATE AS document_date,
  column6::NUMBER(18, 2) AS amount,
  column7::VARCHAR AS currency
FROM VALUES
  ('INV-1001', 'US-EAST', 'INV-1001', 'Acme Stores', '2026-09-03', 125000.00, 'USD'),
  ('INV-1002', 'US-EAST', 'INV-1002', 'Northwind', '2026-09-05', 48250.50, 'USD'),
  ('INV-1003', 'US-WEST', 'INV-1003', 'Contoso', '2026-09-08', 91000.00, 'USD'),
  ('INV-SF-BREAK', 'US-EAST', 'INV-SF-BREAK', 'Break Co', '2026-09-10', 5000.00, 'USD');

CREATE OR REPLACE VIEW findatagraph_gl_v AS
SELECT
  column1::VARCHAR AS external_id,
  column2::VARCHAR AS entity_code,
  column3::VARCHAR AS reference,
  column4::VARCHAR AS account_code,
  column5::DATE AS posting_date,
  column6::NUMBER(18, 2) AS amount,
  column7::VARCHAR AS currency
FROM VALUES
  ('gl-INV-1001', 'US-EAST', 'INV-1001', '4000', '2026-09-04', 125000.00, 'USD'),
  ('gl-INV-1002', 'US-EAST', 'INV-1002', '4000', '2026-09-06', 48000.00, 'USD'),
  ('gl-INV-1003', 'US-WEST', 'INV-1003', '4000', '2026-09-09', 91000.00, 'USD');
  -- INV-SF-BREAK intentionally missing from GL

-- Sanity check
SELECT COUNT(*) AS commercial_rows FROM findatagraph_commercial_v;
SELECT COUNT(*) AS gl_rows FROM findatagraph_gl_v;
