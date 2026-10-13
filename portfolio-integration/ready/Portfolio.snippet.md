# Portfolio.tsx edits

## Add to `projects` array (after Deal Record):

```ts
  {
    to: "/projects/findatagraph",
    tag: "DEMO 03 · FINANCIAL DATA GRAPH",
    title: "FinDataGraph",
    blurb:
      "Spec Studio dual path + continuous close control plane — seeded CRM↔GL, NL-generated agents (CC auth/settlements/received), exceptions, dual-control, audit.",
  },
```

## Optional hero CTA (after Deal Record button):

```tsx
            <Link className="btn btn-ghost" to="/projects/findatagraph">
              FinDataGraph
            </Link>
```
