/**
 * Thin FinDataGraph HTTP client used by MCP tools.
 * All data access goes through the API — never straight to warehouses.
 */

const DEFAULT_BASE = process.env.FINDATAGRAPH_API_URL || "http://127.0.0.1:4000/api/v1";

export class FinDataGraphClient {
  constructor({
    baseUrl = DEFAULT_BASE,
    email = process.env.FINDATAGRAPH_EMAIL || "controller@findatagraph.demo",
    password = process.env.FINDATAGRAPH_PASSWORD || "password123",
    token = process.env.FINDATAGRAPH_TOKEN || null,
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.email = email;
    this.password = password;
    this.token = token;
  }

  async ensureAuth() {
    if (this.token) return this.token;
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Login failed (${res.status})`);
    this.token = data.token;
    this.user = data.user;
    return this.token;
  }

  async request(path, { method = "GET", body } = {}) {
    await this.ensureAuth();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    if (!res.ok) {
      const err = new Error(data?.error || `API ${res.status} on ${path}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
}

/** Standard envelope so agents always see IDs + governance hints */
export function toolResult(payload, { humanGate = false, citations = [] } = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ...payload,
            governance: {
              human_gate_required: humanGate,
              citations,
              note: humanGate
                ? "Material or status-changing action — keep a human in approve/edit/reject before treating as final."
                : "Read/query only — safe to surface to controller with source IDs.",
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

export function toolError(error) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: error.message,
            status: error.status || 500,
            governance: {
              human_gate_required: true,
              note: "Tool failed — do not invent reconciliation outcomes.",
            },
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}
