# SIPOC — peak.close.crm-gl-revenue

See also [docs/JUMPSTART.md](../../../docs/JUMPSTART.md).

| | |
|---|---|
| **Suppliers** | Salesforce Billing, NetSuite GL, client master data |
| **Inputs** | CRM invoices, GL revenue lines, materiality policy |
| **Process** | Connector sync → match → exception lifecycle → Jumpstart report |
| **Outputs** | Exception list, DQ scorecard, variance memo, evidence hashes |
| **Customers** | Controllership, close owners, internal audit |
