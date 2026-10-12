# Apply FinDataGraph to demo-interview--app

This agent cannot push to `selvera247/demo-interview--app` (403).
Copy these files into that repo on `main`, then set the live demo URL.

## 1. Copy files

From this folder into `demo-interview--app`:

| Source (this folder) | Destination |
|---|---|
| `frontend/main.tsx.patch` | merge into `frontend/main.tsx` |
| `frontend/pages/Portfolio.tsx.patch` | merge into `frontend/pages/Portfolio.tsx` |
| `frontend/pages/FinDataGraphCaseStudy.tsx` | `frontend/pages/FinDataGraphCaseStudy.tsx` |

Or copy the ready-made full files from `ready/` if present.

## 2. Set the Launch demo URL

In `FinDataGraphCaseStudy.tsx`, set:

```ts
export const FINDATAGRAPH_DEMO_URL = "https://YOUR-HOST.example";
```

Use the Render URL from [deploy-render.md](../.github/workflows/deploy-render.md).

The ready-made case study appends `/studio` so Launch demo opens Spec Studio
dual-path intake (seeded CRM↔GL + NL generate). If you set the host only, keep:

```ts
export const FINDATAGRAPH_DEMO_URL = "https://YOUR-HOST.example/studio";
```

## 3. Push + Pages deploy

```bash
cd demo-interview--app
git checkout -b feat/findatagraph-portfolio
# apply files
git add frontend
git commit -m "Add FinDataGraph project with Launch demo"
git push -u origin HEAD
# merge to main → GitHub Pages workflow publishes
```

Live portfolio path:

`https://selvera247.github.io/demo-interview--app/#/projects/findatagraph`
