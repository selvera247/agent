# Portfolio.tsx edits

## Add to `projects` array (after Deal Record):

```ts
  {
    to: "/projects/findatagraph",
    tag: "DEMO 03 · FINANCIAL DATA GRAPH",
    title: "FinDataGraph",
    blurb:
      "Hosted continuous close control plane — CRM↔GL matching, exception lifecycle, dual-control corrections, and an audit log over a financial data graph.",
  },
```

## Optional hero CTA (after Deal Record button):

```tsx
            <Link className="btn btn-ghost" to="/projects/findatagraph">
              FinDataGraph
            </Link>
```
