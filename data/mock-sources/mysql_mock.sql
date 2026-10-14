-- Applied automatically by docker-compose.mock-sources.yml on first boot.
-- Database findatagraph_mock is created by MYSQL_DATABASE.

DROP VIEW IF EXISTS findatagraph_commercial_v;
DROP VIEW IF EXISTS findatagraph_gl_v;
DROP TABLE IF EXISTS findatagraph_commercial;
DROP TABLE IF EXISTS findatagraph_gl;

CREATE TABLE findatagraph_commercial (
  external_id VARCHAR(64) PRIMARY KEY,
  entity_code VARCHAR(32) NOT NULL,
  document_number VARCHAR(64) NOT NULL,
  counterparty VARCHAR(128) NOT NULL,
  document_date DATE NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  currency CHAR(3) NOT NULL
);

CREATE TABLE findatagraph_gl (
  external_id VARCHAR(64) PRIMARY KEY,
  entity_code VARCHAR(32) NOT NULL,
  reference VARCHAR(64) NOT NULL,
  account_code VARCHAR(32) NOT NULL,
  posting_date DATE NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  currency CHAR(3) NOT NULL
);

INSERT INTO findatagraph_commercial VALUES
  ('INV-1001', 'US-EAST', 'INV-1001', 'Acme Stores', '2026-09-03', 125000.00, 'USD'),
  ('INV-1002', 'US-EAST', 'INV-1002', 'Northwind', '2026-09-05', 48250.50, 'USD'),
  ('INV-1003', 'US-WEST', 'INV-1003', 'Contoso', '2026-09-08', 91000.00, 'USD'),
  ('INV-M-BREAK', 'US-EAST', 'INV-M-BREAK', 'Break Co', '2026-09-10', 5000.00, 'USD');

INSERT INTO findatagraph_gl VALUES
  ('gl-INV-1001', 'US-EAST', 'INV-1001', '4000', '2026-09-04', 125000.00, 'USD'),
  ('gl-INV-1002', 'US-EAST', 'INV-1002', '4000', '2026-09-06', 48000.00, 'USD'), -- mismatch vs CRM
  ('gl-INV-1003', 'US-WEST', 'INV-1003', '4000', '2026-09-09', 91000.00, 'USD');
  -- INV-M-BREAK intentionally missing from GL

CREATE VIEW findatagraph_commercial_v AS
SELECT external_id, entity_code, document_number, counterparty, document_date, amount, currency
FROM findatagraph_commercial;

CREATE VIEW findatagraph_gl_v AS
SELECT external_id, entity_code, reference, account_code, posting_date, amount, currency
FROM findatagraph_gl;
