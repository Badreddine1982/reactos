import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTOML } from "../src/toml.js";
import { KnowledgeMemory } from "../src/memory.js";
import { ModelSwitcher } from "../src/switcher.js";

test("TOML parser: tables, arrays-of-tables, values", () => {
  const cfg = parseTOML(`
[harness]
name = "X"
[[model]]
id = "a"
default = true
[[model]]
id = "b"
[memory]
enabled = true
`);
  assert.equal(cfg.harness.name, "X");
  assert.equal(cfg.model.length, 2);
  assert.equal(cfg.model[0].id, "a");
  assert.equal(cfg.model[0].default, true);
  assert.equal(cfg.memory.enabled, true);
});

function tmpCfg() {
  const dir = mkdtempSync(join(tmpdir(), "sc-"));
  return {
    harness: { name: "T", version: "0" },
    runtime: {},
    model: [{ id: "a", provider: "openai", api_key_env: "X", default: true }, { id: "b", provider: "ollama" }],
    switching: { enabled: true, active_model: "a", persist_memory_on_switch: true, rehydrate_memory_on_switch: true, track_provenance: true,
      route: [{ when: "task.kind==high_volume", use: "a" }, { when: "task.needs_polish", use: "b" }] },
    memory: { enabled: true, path: dir, layers: { knowledge: true, decisions: true, working: true, facts: true },
      injection: { top_k: 5, always_include_facts: true, always_include_recent_decisions: 3 } },
  };
}

test("Knowledge memory survives a model switch (core guarantee)", () => {
  const cfg = tmpCfg();
  const mem = new KnowledgeMemory(cfg);
  mem.remember("low cost preferred for high volume");
  mem.fact("architecture", "cordis");
  const sw = new ModelSwitcher(cfg, mem);

  assert.equal(sw.activeId, "a");
  const before = mem.stats().knowledge;

  const r = sw.switchTo("b");
  assert.equal(r.switched, true);
  assert.equal(sw.activeId, "b");
  // knowledge is untouched by the switch
  assert.equal(mem.stats().knowledge, before);
  // a snapshot was persisted and provenance recorded
  assert.ok(r.snapshot);
  assert.ok(mem.all("decisions").some((d) => d.decision.includes("a -> b")));

  // the context injected into the NEW model still contains the old knowledge
  const ctx = mem.buildContext("high volume cost");
  assert.match(ctx, /cordis/);
  assert.match(ctx, /low cost preferred/);
});

test("Auto-routing picks a model by task hints", () => {
  const cfg = tmpCfg();
  const mem = new KnowledgeMemory(cfg);
  const sw = new ModelSwitcher(cfg, mem);
  assert.equal(sw.route({ task: { needs_polish: true } }), "b");
  assert.equal(sw.route({ task: { kind: "high_volume" } }), "a");
});

test("consolidate folds working memory into knowledge", () => {
  const cfg = tmpCfg();
  const mem = new KnowledgeMemory(cfg);
  mem.note("session note 1");
  mem.note("session note 2");
  const k0 = mem.stats().knowledge;
  const moved = mem.consolidate();
  assert.equal(moved, 2);
  assert.equal(mem.stats().working, 0);
  assert.equal(mem.stats().knowledge, k0 + 2);
});
