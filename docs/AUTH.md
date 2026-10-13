# Authentication & authorization

**Preferred IdPs for client tenancy:** **Okta** or **Clerk**  
**Jumpstart demo fallback:** local email/password JWT

## Modes

| `AUTH_MODE` | Human login | API Bearer |
|---|---|---|
| `local` (default) | Demo users | App-signed HS256 JWT |
| `okta` | Okta OIDC PKCE redirect | Okta access token (JWKS) |
| `clerk` | Clerk `<SignIn />` | Clerk session JWT (JWKS) |

Set `AUTH_ALLOW_LOCAL=1` to keep demo password login beside Okta/Clerk (dev only).

## Role mapping (authz)

App roles remain: `admin` · `controller` · `accountant` (+ entity scope).

Resolution order:

1. Explicit claim `AUTH_ROLE_CLAIM` (default `role`) or `fnd_role`
2. Clerk `org_role` / `public_metadata.role`
3. Okta `groups` / `roles` vs `AUTH_GROUP_ADMIN|CONTROLLER|ACCOUNTANT`
4. `AUTH_DEFAULT_ROLE` (default `accountant`)

Entity scope: claim `entity_ids` (JSON array) or `AUTH_ENTITY_CLAIM`.

## Clerk setup

1. Create Clerk application; enable email/SSO as needed.
2. Configure JWT template / session token to include `email`, optional `role` / `org_id` / `entity_ids`.
3. Env:

```bash
AUTH_MODE=clerk
CLERK_PUBLISHABLE_KEY=pk_...
CLERK_FRONTEND_API=https://your-instance.clerk.accounts.dev
# or CLERK_JWT_ISSUER=https://your-instance.clerk.accounts.dev
# optional: CLERK_JWKS_URI=...  CLERK_JWT_AUDIENCE=...
AUTH_DEFAULT_ORG_ID=org_fdg_demo
VITE_CLERK_PUBLISHABLE_KEY=pk_...   # web build
```

## Okta setup

1. Create OIDC Web / SPA app with PKCE; redirect URI `https://<app>/login/callback`.
2. Assign groups e.g. `findatagraph-admin`, `findatagraph-controller`, `findatagraph-accountant`.
3. Env:

```bash
AUTH_MODE=okta
OKTA_ISSUER=https://dev-xxxxx.okta.com/oauth2/default
OKTA_CLIENT_ID=...
OKTA_AUDIENCE=api://default   # or client id
PUBLIC_APP_URL=https://your-jumpstart.example
# AUTH_GROUP_CONTROLLER=findatagraph-controller
```

## Authorization posture

| Control | Behavior |
|---|---|
| Route RBAC | `requireRoles('admin','controller',…)` |
| Entity scope | Accountants filtered by `entity_ids` |
| Dual-control | Material corrections (≥ $10k) require second actor |
| SoD | **Proposer cannot approve/reject their own correction** |
| Audit | Login + privileged actions → `audit_log` / `evidence` |

## Agent / connector identity

LangGraph and Snowflake use **workload credentials** (`ORCHESTRATOR_*`, `SNOWFLAKE_PAT`), not the human browser session long-term. Cluster runs may forward the caller JWT for control-plane tool calls during the session.
