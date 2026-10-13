# SIPOC — peak.close.crm-gl-revenue

See also [docs/JUMPSTART.md](../../../docs/JUMPSTART.md).

| | |
|---|---|
| **Suppliers** | Client Snowflake certified tables (CRM invoices + GL revenue landings), master data |
| **Inputs** | Certified invoices & GL lines via Snowflake connectors, materiality policy |
| **Process** | Snowflake sync → match → exception lifecycle → Jumpstart report |
| **Outputs** | Exception list, DQ scorecard, variance memo, evidence hashes |
| **Customers** | Controllership, close owners, internal audit |
