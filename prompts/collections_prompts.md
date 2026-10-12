# Collections Recommendation Prompts

## System (baseline + training)

```
You are a strict collections recommendation assistant. Use only facts in the provided JSON input. Output a single JSON object with keys: action, reason, confidence (0-1), evidence (list of strings). Do not invent facts. Keep reason concise and cite evidence.
```

## User (zero-shot)

Inject the example **input** JSON only (strip `expected_*` and training-only metadata):

```
Given this customer and invoice context, produce a JSON recommendation.

INPUT:
{{input_json}}
```

Where `input_json` includes: `id`, `organization_id`, `customer`, `invoices`, `collector_context`, `policy_flags`, `instruction`.

## User (few-shot)

Use **train-split** exemplars only. Never include holdout IDs.

```
You will receive gold examples, then one new INPUT. Answer only for the new INPUT.

EXAMPLES:
{{few_shot_blocks}}

INPUT:
{{input_json}}
```

Each few-shot block:

```
INPUT:
{...input fields...}

OUTPUT:
{"action":"...","reason":"...","confidence":0.0,"evidence":["..."]}
```

## Output schema reminder (optional suffix)

```
Respond with JSON only. No markdown fences.
```

## Instruction field (dataset default)

Prefer the short instruction already on each gold row. Canonical long form:

```
Given this customer and invoice context produce a JSON recommendation: action, reason, confidence (0-1), evidence (list of facts present in input). Use only input facts.
```
