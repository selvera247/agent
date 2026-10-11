import { useState } from "react";
import {
  platforms,
  capabilities,
  flow,
  outcomes,
  startingPoints,
} from "./content";
import "./App.css";

const stackRoles = [
  ["foundation", "Foundation"],
  ["bi", "Dashboards"],
  ["converse", "Conversation"],
  ["action", "Action layer"],
  ["agents", "Agents"],
];

export default function App() {
  const [activePlatform, setActivePlatform] = useState(platforms[0].id);
  const selected =
    platforms.find((p) => p.id === activePlatform) ?? platforms[0];

  return (
    <div className="page">
      <header className="nav">
        <div className="nav-brand">Peak Close</div>
        <nav className="nav-links" aria-label="Primary">
          <a href="#pattern">Pattern</a>
          <a href="#platforms">Platforms</a>
          <a href="#flow">Loop</a>
          <a href="#start">Start</a>
        </nav>
      </header>

      <section className="hero" aria-label="Hero">
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-plane" />
        </div>
        <div className="hero-content">
          <p className="brand-mark">Peak Close</p>
          <h1>Continuous close & reconciliation—on any data stack</h1>
          <p className="hero-lead">
            A governed detect → investigate → resolve → report loop that works
            the same whether you run Databricks, Snowflake, BigQuery, or
            warehouse + MySQL.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#platforms">
              Compare platforms
            </a>
            <a className="btn btn-ghost" href="#flow">
              See the loop
            </a>
          </div>
        </div>
      </section>

      <section className="section" id="pattern">
        <p className="section-label">The core problem</p>
        <h2>Month-end still lives in spreadsheets and email</h2>
        <p className="section-intro">
          Traditional close pulls from ERP, CRM, billing, planning tools, and
          side files—then matches invoices, intercompany, subledger-to-GL, and
          CRM revenue vs. accounting by hand. Visibility lags by days or weeks;
          “why” questions are slow; auditability suffers.
        </p>
        <ul className="problem-list">
          <li>
            Multi-system extracts from SAP, NetSuite, Sage, CRM, and billing
            into Excel.
          </li>
          <li>
            Manual matching for invoices, intercompany balances, and
            subledger-to-GL.
          </li>
          <li>Variance commentary trapped in email chains and workbooks.</li>
          <li>
            High-pressure periods with limited self-service and weak lineage.
          </li>
        </ul>
      </section>

      <section className="section" id="architecture">
        <p className="section-label">Architecture</p>
        <h2>One pattern. Five capabilities. Your platform.</h2>
        <p className="section-intro">
          The value is the loop and the governance model—not a single vendor.
          Map each capability to Databricks, Snowflake, MySQL-backed ops stores,
          or another lakehouse/warehouse.
        </p>
        <div className="capabilities">
          {capabilities.map((item, index) => (
            <article className="capability" key={item.title}>
              <span className="capability-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="platforms">
        <p className="section-label">Platform map</p>
        <h2>Same roles across Snowflake, Databricks, MySQL, and more</h2>
        <p className="section-intro">
          Pick your stack. The roles stay fixed: governed foundation, BI for
          detection, conversational analytics for investigation, apps for
          resolution, optional agents for multi-step work.
        </p>

        <div
          className="platform-tabs"
          role="tablist"
          aria-label="Data platforms"
        >
          {platforms.map((platform) => (
            <button
              key={platform.id}
              type="button"
              role="tab"
              className="platform-tab"
              aria-selected={platform.id === activePlatform}
              onClick={() => setActivePlatform(platform.id)}
            >
              {platform.name}
            </button>
          ))}
        </div>

        <div
          className="stack-panel"
          role="tabpanel"
          aria-live="polite"
          key={selected.id}
        >
          <h3>{selected.name}</h3>
          <div className="stack-grid">
            {stackRoles.map(([key, label]) => (
              <div className="stack-row" key={key}>
                <div className="stack-role">{label}</div>
                <p className="stack-value">{selected.stack[key]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="flow">
        <p className="section-label">Operating loop</p>
        <h2>Detect → investigate → resolve → report</h2>
        <p className="section-intro">
          Demonstrated for mid-size retailers reconciling CRM invoices vs.
          accounting—and the same loop covers intercompany, AR/AP, and
          subledger-to-GL.
        </p>
        <div className="flow">
          {flow.map((item) => (
            <article className="flow-step" key={item.step}>
              <div className="flow-num">{item.step}</div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="outcomes">
        <p className="section-label">Outcomes</p>
        <h2>What mature programs report</h2>
        <p className="section-intro">
          Results vary by foundation maturity, but the pattern consistently
          compresses cycle time when metrics are certified and investigation is
          self-serve.
        </p>
        <div className="outcomes">
          {outcomes.map((item) => (
            <article className="outcome" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="governance">
        <section className="section" id="governance">
          <p className="section-label">Governance</p>
          <h2>Auditability is non-negotiable</h2>
          <p className="section-intro">
            Every conversational query respects platform permissions, produces
            logged SQL, and ties back to source tables. App corrections create
            timestamped records. Models and agents are versioned in the catalog
            so “how was this produced?” stays answerable. Human approval remains
            the default for material exceptions—whether you enforce that in
            Unity Catalog, Snowflake Horizon, IAM + MySQL audit tables, or
            equivalent.
          </p>
        </section>
      </div>

      <section className="section" id="start">
        <p className="section-label">Implementation</p>
        <h2>Common starting points</h2>
        <p className="section-intro">
          Data teams own the model, dashboards, and agents; finance drives
          investigation and resolution once live. FDEs and partner SAs often
          productionize the foundation, semantic grounding, and write-back apps.
        </p>
        <ol className="start-list">
          {startingPoints.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <footer className="footer">
        Peak Close — continuous close & reconciliation as a universal agentic
        pattern across Databricks, Snowflake, MySQL, and the modern warehouse.
      </footer>
    </div>
  );
}
