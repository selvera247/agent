import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "./yamlLite.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root: apps/api/src/services → ../../../../ */
const REPO_ROOT = path.join(__dirname, "../../../../");
const REGISTRY_AGENTS = path.join(REPO_ROOT, "registry/agents");

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function listAgentDirs() {
  if (!fs.existsSync(REGISTRY_AGENTS)) return [];
  return fs
    .readdirSync(REGISTRY_AGENTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export function listRegistryAgents() {
  return listAgentDirs().map((dir) => {
    const agentYaml = readIfExists(path.join(REGISTRY_AGENTS, dir, "agent.yaml"));
    const parsed = agentYaml ? yaml.parse(agentYaml) : { id: dir };
    return {
      package_dir: dir,
      id: parsed.id || dir,
      title: parsed.title || parsed.name || dir,
      domain: parsed.domain || null,
      version: parsed.version || null,
      workflow: parsed.workflow || null,
      path: `registry/agents/${dir}`,
    };
  });
}

export function getRegistryAgent(packageDirOrId) {
  const dirs = listAgentDirs();
  let dir = dirs.find((d) => d === packageDirOrId);
  if (!dir) {
    for (const d of dirs) {
      const raw = readIfExists(path.join(REGISTRY_AGENTS, d, "agent.yaml"));
      const parsed = raw ? yaml.parse(raw) : {};
      if (parsed.id === packageDirOrId) {
        dir = d;
        break;
      }
    }
  }
  if (!dir) return null;

  const base = path.join(REGISTRY_AGENTS, dir);
  const agentYaml = readIfExists(path.join(base, "agent.yaml"));
  const ontology = readIfExists(path.join(base, "ontology.json"));
  const readme = readIfExists(path.join(base, "README.md"));
  const acceptance = readIfExists(path.join(base, "ACCEPTANCE.md"));
  const sipoc = readIfExists(path.join(base, "SIPOC.md"));

  const policyDir = path.join(base, "policies");
  const policies = fs.existsSync(policyDir)
    ? fs
        .readdirSync(policyDir)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"))
        .map((f) => ({
          file: f,
          content: readIfExists(path.join(policyDir, f)),
        }))
    : [];

  const evalDir = path.join(base, "evals");
  const evals = fs.existsSync(evalDir)
    ? fs
        .readdirSync(evalDir)
        .filter((f) => !f.startsWith("."))
        .map((f) => f)
    : [];

  const connectorDir = path.join(base, "connectors");
  const connectors = fs.existsSync(connectorDir)
    ? fs
        .readdirSync(connectorDir)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"))
        .map((f) => ({
          file: f,
          content: readIfExists(path.join(connectorDir, f)),
        }))
    : [];

  return {
    package_dir: dir,
    path: `registry/agents/${dir}`,
    agent: agentYaml ? yaml.parse(agentYaml) : null,
    agent_yaml: agentYaml,
    ontology: ontology ? JSON.parse(ontology) : null,
    policies,
    connectors,
    evals,
    sipoc,
    acceptance,
    readme,
  };
}
