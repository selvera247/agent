# Client-cloud delivery

Forward-deployed shape: configure connectors, agent logic, packaging, and audit trails **inside the client’s ERP/EPM and cloud**, under their security and change control — not a CrossCountry-hosted platform.

## Tenancy

| Concern | Guidance |
|---|---|
| Cloud | Azure, AWS, or GCP project owned by the client |
| LLM | Client enterprise tenancy or VPC Ollama/vLLM (`allow_external_apis: false`) |
| Data | Connectors into SoR; certified staging in client DB/warehouse — no large extracts off-tenant |
| Identity | Prefer **Okta or Clerk** (`AUTH_MODE=okta|clerk`); see `docs/AUTH.md` |

## Packaging & promotion

1. Build container from repo `Dockerfile` (API + web).
2. Push to **client** registry.
3. Deploy via client CI/CD: `dev → staging → production` with their gates.
4. Mount persistent volume for DB (`DATABASE_PATH`) or point to managed Postgres later.
5. Set secrets in client secret store: `JWT_SECRET`, connector credentials, LLM endpoints.
6. Set `CONNECTOR_LIVE=1` with `SNOWFLAKE_MODE=sandbox` for Jumpstart; switch to live Snowflake secrets in-tenant for production (see `docs/LIVE_SNOWFLAKE.md`).

### Kubernetes sketch

```yaml
# illustrative — adapt to client charts
apiVersion: apps/v1
kind: Deployment
metadata:
  name: findatagraph
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: api
          image: <client-registry>/findatagraph:jumpstart
          ports:
            - containerPort: 4000
          env:
            - name: DATABASE_PATH
              value: /data/findatagraph.db
            - name: CORS_ORIGIN
              value: https://close.client.example
            - name: POLICY_VERSION
              value: jumpstart-v1
          volumeMounts:
            - name: data
              mountPath: /data
```

## Engagement loop

```
Embed with finance / IT / data
  → Week-1 Jumpstart (docs/JUMPSTART.md)
  → Demo working agent to finance leadership
  → Feed accelerators into registry/ practice library
  → Expand cluster (close, SOX, forecast, collections…) only after acceptance
```

## Practice library feedback

After each engagement, PR back into this repo:

- Certified connector configs under `registry/mcp/` or `registry/agents/*/connectors/`
- Eval fixtures from real (pseudonymized) break types
- Policy threshold defaults the client validated
- Agent manifest version bump

List packages: `GET /api/v1/registry/agents`
