import crypto from "node:crypto";
import { getDb } from "../db/connection.js";

/**
 * Hybrid retrieval over certified staging for the investigate step.
 * Combines structured filters (reference / entity / amounts) with
 * lexical BM25-lite over invoice + GL text documents (RAG substrate
 * without shipping data off-tenant).
 */

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9._-]+/)
    .filter((t) => t.length > 1);
}

function bm25Score(queryTokens, docTokens, avgDl, df, N, k1 = 1.2, b = 0.75) {
  const tf = new Map();
  for (const t of docTokens) tf.set(t, (tf.get(t) || 0) + 1);
  const dl = docTokens.length || 1;
  let score = 0;
  for (const q of queryTokens) {
    const f = tf.get(q) || 0;
    if (!f) continue;
    const n = df.get(q) || 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    const denom = f + k1 * (1 - b + (b * dl) / avgDl);
    score += idf * ((f * (k1 + 1)) / denom);
  }
  return score;
}

function buildCorpus(orgId) {
  const db = getDb();
  const invoices = db
    .prepare(
      `SELECT i.*, e.code AS entity_code
       FROM crm_invoices i
       JOIN entities e ON e.id = i.entity_id
       WHERE i.org_id = ?`
    )
    .all(orgId);
  const glLines = db
    .prepare(
      `SELECT g.*, e.code AS entity_code
       FROM gl_revenue_lines g
       JOIN entities e ON e.id = g.entity_id
       WHERE g.org_id = ?`
    )
    .all(orgId);

  const docs = [];
  for (const inv of invoices) {
    const text = [
      "crm_invoice",
      inv.invoice_number,
      inv.customer_name,
      inv.entity_code,
      inv.amount,
      inv.invoice_date,
      inv.currency,
    ].join(" ");
    docs.push({
      id: inv.id,
      kind: "crm_invoice",
      reference: inv.invoice_number,
      entity_code: inv.entity_code,
      amount: inv.amount,
      text,
      structured: {
        invoice_number: inv.invoice_number,
        customer_name: inv.customer_name,
        invoice_date: inv.invoice_date,
        amount: inv.amount,
        currency: inv.currency,
        entity_code: inv.entity_code,
      },
    });
  }
  for (const gl of glLines) {
    const text = [
      "gl_revenue",
      gl.reference,
      gl.account_code,
      gl.entity_code,
      gl.amount,
      gl.posting_date,
    ].join(" ");
    docs.push({
      id: gl.id,
      kind: "gl_revenue_line",
      reference: gl.reference,
      entity_code: gl.entity_code,
      amount: gl.amount,
      text,
      structured: {
        reference: gl.reference,
        account_code: gl.account_code,
        posting_date: gl.posting_date,
        amount: gl.amount,
        currency: gl.currency,
        entity_code: gl.entity_code,
      },
    });
  }
  return docs;
}

/**
 * Retrieve evidence pack for an exception / natural-language investigate query.
 */
export function hybridRetrieve({
  orgId,
  query = "",
  reference = null,
  entityCode = null,
  limit = 8,
}) {
  const docs = buildCorpus(orgId);
  const queryTokens = tokenize(
    [query, reference, entityCode].filter(Boolean).join(" ")
  );

  // Structured prefilter
  let candidates = docs;
  if (reference) {
    const exact = docs.filter(
      (d) => d.reference === reference || d.structured.invoice_number === reference
    );
    if (exact.length) candidates = exact;
  }
  if (entityCode) {
    const scoped = candidates.filter((d) => d.entity_code === entityCode);
    if (scoped.length) candidates = scoped;
  }

  const N = Math.max(candidates.length, 1);
  const df = new Map();
  const tokenized = candidates.map((d) => {
    const toks = tokenize(d.text);
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
    return toks;
  });
  const avgDl =
    tokenized.reduce((s, t) => s + t.length, 0) / Math.max(tokenized.length, 1);

  const scored = candidates.map((doc, i) => {
    let score = bm25Score(queryTokens, tokenized[i], avgDl, df, N);
    // Structured boosts
    if (reference && doc.reference === reference) score += 5;
    if (entityCode && doc.entity_code === entityCode) score += 1.5;
    return { ...doc, score: Number(score.toFixed(4)) };
  });

  scored.sort((a, b) => b.score - a.score);
  const hits = scored.slice(0, limit).filter((h) => h.score > 0 || reference);

  const packHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(hits.map((h) => ({ id: h.id, score: h.score }))))
    .digest("hex");

  return {
    mode: "hybrid_structured_bm25",
    query: query || null,
    reference: reference || null,
    hit_count: hits.length,
    corpus_size: docs.length,
    content_hash: packHash,
    hits: hits.map(({ text, ...rest }) => rest),
    citations: hits.map(
      (h) => `staging:${h.kind}:${h.reference || h.id}`
    ),
  };
}

/**
 * Investigate open exceptions for a reconciliation run via hybrid retrieval.
 */
export function investigateRun({ orgId, runId, limitPerException = 4 }) {
  const db = getDb();
  const exceptions = db
    .prepare(
      `SELECT x.*, e.code AS entity_code
       FROM exceptions x
       JOIN entities e ON e.id = x.entity_id
       WHERE x.org_id = ? AND x.run_id = ?
         AND x.status IN ('open', 'assigned', 'pending_approval')
       ORDER BY ABS(COALESCE(x.variance, 0)) DESC
       LIMIT 25`
    )
    .all(orgId, runId);

  const packs = exceptions.map((ex) => {
    const retrieval = hybridRetrieve({
      orgId,
      reference: ex.reference,
      entityCode: ex.entity_code,
      query: `${ex.exception_type} ${ex.title} variance ${ex.variance}`,
      limit: limitPerException,
    });
    return {
      exception_id: ex.id,
      reference: ex.reference,
      exception_type: ex.exception_type,
      variance: ex.variance,
      entity_code: ex.entity_code,
      retrieval,
    };
  });

  return {
    run_id: runId,
    investigated_count: packs.length,
    packs,
    summary: {
      with_hits: packs.filter((p) => p.retrieval.hit_count > 0).length,
      mode: "hybrid_structured_bm25",
    },
  };
}
