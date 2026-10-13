# Client registry + staging → production promote path

Forward-deployed shape: build once, push to **client-accessible** registry (GHCR or client ACR/ECR/GAR), promote manifests under client change control.

## Pipeline

| Stage | Trigger | Action |
|---|---|---|
| **test** | PR / push | `npm test` + orchestrator `pytest` |
| **build-and-push** | push / dispatch | Docker build API + LangGraph orchestrator → `ghcr.io/<org>/findatagraph(:tag)` |
| **deploy-staging** | push to `main` or `cursor/**` | Render `deploy/k8s/staging` · `kubectl apply` when `KUBECONFIG_STAGING` secret set |
| **deploy-production** | `workflow_dispatch` → production | Render `deploy/k8s/production` · requires `KUBECONFIG_PRODUCTION` + GitHub Environment approval |

Workflow: [`.github/workflows/ci-promote.yml`](../.github/workflows/ci-promote.yml)

## Client secrets (never in git)

| Secret | Used for |
|---|---|
| `KUBECONFIG_STAGING` / `KUBECONFIG_PRODUCTION` | In-cluster apply |
| `JWT_SECRET` | API auth |
| `SNOWFLAKE_ACCOUNT` / `SNOWFLAKE_USER` / `SNOWFLAKE_PAT` | Live Snowflake SoR |
| `SNOWFLAKE_WAREHOUSE` / `DATABASE` / `SCHEMA` | Certified table context |
| `CONNECTOR_LIVE=1` | Enable live/sandbox pull into staging tables |

Staging defaults `SNOWFLAKE_MODE=sandbox` (fixture warehouse). Production sets `SNOWFLAKE_MODE=live` and requires client Snowflake credentials from the secret store.

## Manual promote

```bash
# After CI publishes sha-<commit>
export TAG=sha-$(git rev-parse HEAD)
sed -e "s|__IMAGE_API__|ghcr.io/<org>/findatagraph:$TAG|g" \
    -e "s|__IMAGE_ORCH__|ghcr.io/<org>/findatagraph-orchestrator:$TAG|g" \
    deploy/k8s/staging/deployment.yaml | kubectl apply -f -
```

## Environments in-cluster

- API: `findatagraph:4000` (control plane + Jumpstart UI)
- Orchestrator: `findatagraph-orchestrator:8100` (LangGraph)
- API env `ORCHESTRATOR_URL=http://findatagraph-orchestrator:8100`
- Orchestrator calls back via `CONTROL_PLANE_URL=http://findatagraph:4000`
