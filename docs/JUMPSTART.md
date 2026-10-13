# Week-1 Jumpstart Kit

Frozen deliverable for client engagements: **one governed agent** on the client’s data, producing diagnostic outputs only. Expand to a domain cluster after acceptance.

## SIPOC — CRM invoices ↔ GL revenue

| | |
|---|---|
| **Suppliers** | Client CRM (Salesforce Billing), ERP/GL (NetSuite), finance controllers, IT/security |
| **Inputs** | Certified staging extracts (or MCP reads) of invoices + GL revenue lines; materiality & tolerance policy; entity master |
| **Process** | Map process → configure connectors → run detect matcher → investigate exceptions → HITL resolve/waive → emit Jumpstart report |
| **Outputs** | Exception list · data-quality scorecard · variance memo · evidence hashes for each control action |
| **Customers** | Controllership, FP&A close owners, internal audit / SOX, IT change-control |

## Installable unit (this repo)

| Piece | Location |
|---|---|
| Spec Studio template → definition | `apps/api/src/services/specStudio.js` (`crm_gl_revenue`) |
| Matcher + exception lifecycle + HITL | `apps/api/src/services/matching.js`, `routes/exceptions.js` |
| Audit + evidence | `apps/api/src/lib/audit.js`, `GET /api/v1/evidence` |
| Jumpstart report | `GET /api/v1/reports/jumpstart` |
| Cluster envelope | `POST /api/v1/cluster/run` |
| Practice package | `registry/agents/peak-close-crm-gl/` |

## Acceptance checklist (gate before expand)

- [ ] SIPOC reviewed with client finance + IT
- [ ] Connectors pointed at **client** staging / SoR (stub sync OK for demo; live MCP in client tenancy)
- [ ] One agent run completes on live or recent client data
- [ ] Exception list reconcilable to source-system queries
- [ ] DQ scorecard match rate + open variance reviewed by controller
- [ ] Variance memo shared with finance leadership
- [ ] Evidence rows exist for run + report (`content_hash` present)
- [ ] Material dual-control path exercised (≥ materiality threshold)
- [ ] No bulk data egress outside client cloud / LLM tenancy
- [ ] Sign-off recorded before domain cluster expansion

## Output contract (diagnostic only)

Do **not** promise full close automation in week 1. Ship:

1. **Exception list** — open breaks with reference, entity, type, variance  
2. **Data-quality scorecard** — match rate, open/material counts, freshness note  
3. **Variance memo** — short controller-ready narrative  

## Demo path

```bash
npm install
npm run db:seed -w @findatagraph/api
npm run dev:api   # :4000
# login as controller@findatagraph.demo / password123
curl -s -X POST http://localhost:4000/api/v1/cluster/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
curl -s http://localhost:4000/api/v1/reports/jumpstart \
  -H "Authorization: Bearer $TOKEN"
```
