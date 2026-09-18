// Loads and validates smartcrew.config.toml.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { parseTOML } from "./toml.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, "..");

export function configPath() {
  return join(PROJECT_ROOT, "smartcrew.config.toml");
}

export function loadConfig(path = configPath()) {
  if (!existsSync(path)) {
    throw new Error(`Config not found: ${path}`);
  }
  const text = readFileSync(path, "utf8");
  const cfg = parseTOML(text);
  validate(cfg);
  return cfg;
}

function validate(cfg) {
  if (!cfg.harness) throw new Error("config: missing [harness]");
  if (!Array.isArray(cfg.model) || cfg.model.length === 0) {
    throw new Error("config: at least one [[model]] is required");
  }
  if (!cfg.memory) throw new Error("config: missing [memory] — the knowledge layer is mandatory");
  const ids = cfg.model.map((m) => m.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error(`config: duplicate model id(s): ${dupes.join(", ")}`);
}

export function defaultModelId(cfg) {
  const explicit = cfg.model.find((m) => m.default);
  const fromSwitching = cfg.switching?.active_model;
  return fromSwitching || (explicit && explicit.id) || cfg.model[0].id;
}

export function getModel(cfg, id) {
  const m = cfg.model.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model id: ${id}. Available: ${cfg.model.map((x) => x.id).join(", ")}`);
  return m;
}

export default { loadConfig, configPath, defaultModelId, getModel, PROJECT_ROOT };
