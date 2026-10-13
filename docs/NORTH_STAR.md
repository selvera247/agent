# FinDataGraph — North Star

## One-liner

**One financial data graph, many platforms, one agent tool surface — with humans on the gate.**

## Destination

Finance teams run continuous close / O2C recon where:

1. **Data** lands from Postgres, MySQL, Snowflake, Databricks (later eBS / SAP) into **certified** commercial + accounting + GL shapes  
2. **Matchers** open durable exceptions with source IDs  
3. **Controllers** investigate in the control tower *or* via agents  
4. **MCP skills** orchestrate sync → run → investigate → propose — never silent post  
5. **Evidence** (audit + citations + planted evals) makes Internal Audit and Controllership trust the loop  

## Skill split (deliberate)

| Surface | Owns | Must not own |
|---|---|---|
| Close Agent MCP | Flux commentary, JE citations, review language | Exception system of record |
| FinDataGraph Recon MCP | Sources, runs, exceptions, corrections, audit | Hallucinated clearances |
| FinDataGraph API + UI | System of record + HITL | Per-warehouse SQL in the agent |

Agents are clients. The graph is the product.

## Principles

1. **No parallel data path** — MCP → API → adapters only  
2. **Cite or don’t claim** — every material answer carries exception/run/doc IDs  
3. **Human gate by default** — propose/correct; resolve only with controller confirmation  
4. **Planted breaks before bragging** — eval harness gates “demo ready”  
5. **Platform-agnostic core** — new ERP = new adapter, same tools  

## Horizon (ordered)

1. ~~Warehouse connectors + recon MCP + close MCP + planted evals (v1)~~
2. Durable hosted demo + portfolio Launch button
3. Live warehouse views (one Postgres or Snowflake mart)
4. SAP SD–shaped billing↔FI slice **or** eBS sub↔SLA↔GL slice
5. Unified agent session loading **both** MCP skill packs
6. Optional governed write-back (parked JE) — still HITL

## Success metrics (product)

- Time from “source refreshed” → ranked open exceptions  
- % exceptions closed with cited IDs (not free-text only)  
- Eval pass rate on planted set (hold ≥ 100% on fixture suite)  
- Controller willingness to retire the side spreadsheet for one recon type  
