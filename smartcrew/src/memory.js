// ============================================================================
//  Knowledge Memory — model-agnostic persistent memory.
//  ★ This is the core of SMARTCREW: memory is decoupled from the model. ★
//  Switching models never erases what the system's decisions rely on.
//
//  Layers (per config [memory.layers]):
//    - knowledge : long-lived facts/insights decisions rely on (permanent)
//    - decisions : a provenance log of past decisions + which model made them
//    - working   : short-term session context (folded into knowledge on close)
//    - facts     : stable facts/preferences (always injected)
//
//  Storage is plain JSONL on disk => portable, inspectable, model-independent.
// ============================================================================
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROJECT_ROOT } from "./config.js";

const LAYERS = ["knowledge", "decisions", "working", "facts"];

export class KnowledgeMemory {
  constructor(cfg) {
    this.cfg = cfg;
    this.mem = cfg.memory || {};
    this.dir = resolve(PROJECT_ROOT, this.mem.path || "./.smartcrew/memory");
    this.enabled = this.mem.enabled !== false;
    if (this.enabled) mkdirSync(this.dir, { recursive: true });
  }

  _file(layer) {
    return join(this.dir, `${layer}.jsonl`);
  }

  _layerEnabled(layer) {
    const layers = this.mem.layers || {};
    // default true if not specified
    return layers[layer] !== false;
  }

  // ---- write ---------------------------------------------------------------
  _append(layer, entry) {
    if (!this.enabled || !this._layerEnabled(layer)) return null;
    const record = {
      id: `${layer}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      layer,
      ...entry,
    };
    appendFileSync(this._file(layer), JSON.stringify(record) + "\n", "utf8");
    return record;
  }

  remember(text, opts = {}) {
    return this._append("knowledge", { text, tags: opts.tags || [], source: opts.source || "user" });
  }

  fact(key, value) {
    return this._append("facts", { key, value });
  }

  note(text) {
    return this._append("working", { text });
  }

  // Records a decision AND which model produced it (provenance) — so the
  // knowledge basis of a decision survives any later model switch.
  recordDecision({ decision, rationale, model, inputs }) {
    return this._append("decisions", {
      decision,
      rationale: rationale || "",
      model: model || "unknown",
      inputs: inputs || null,
    });
  }

  // ---- read ----------------------------------------------------------------
  _read(layer) {
    const f = this._file(layer);
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  }

  all(layer) {
    return this._read(layer);
  }

  // Naive lexical retrieval (top_k). A vector store can be plugged in later
  // via [memory.embedding]; retrieval stays model-agnostic either way.
  retrieve(query, k) {
    const topK = k || this.mem.injection?.top_k || 8;
    const q = String(query || "").toLowerCase();
    const terms = q.split(/\W+/).filter((t) => t.length > 2);
    const pool = [...this._read("knowledge"), ...this._read("working")];
    const scored = pool.map((e) => {
      const hay = JSON.stringify(e).toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score++;
      return { e, score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.e);
  }

  // ---- injection: build the context that primes ANY model ------------------
  // This is what makes model switching lossless: the same knowledge context
  // is reconstructed and injected regardless of which model is active.
  buildContext(query) {
    const inj = this.mem.injection || {};
    const parts = [];

    if (inj.always_include_facts !== false) {
      const facts = this._read("facts");
      if (facts.length) {
        parts.push("## Known facts\n" + facts.map((f) => `- ${f.key}: ${f.value}`).join("\n"));
      }
    }

    const nRecent = inj.always_include_recent_decisions ?? 5;
    if (nRecent > 0) {
      const decisions = this._read("decisions").slice(-nRecent);
      if (decisions.length) {
        parts.push(
          "## Recent decisions (with provenance)\n" +
            decisions.map((d) => `- [${d.model}] ${d.decision} — ${d.rationale}`).join("\n")
        );
      }
    }

    const retrieved = this.retrieve(query);
    if (retrieved.length) {
      parts.push(
        "## Relevant knowledge\n" +
          retrieved.map((r) => `- ${r.text || JSON.stringify(r)}`).join("\n")
      );
    }

    return parts.join("\n\n");
  }

  // ---- switching support ---------------------------------------------------
  // Snapshot the whole memory before switching models (safety net).
  snapshot(label = "switch") {
    if (!this.enabled) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapDir = join(this.dir, "snapshots", `${label}-${stamp}`);
    mkdirSync(snapDir, { recursive: true });
    for (const layer of LAYERS) {
      const f = this._file(layer);
      if (existsSync(f)) copyFileSync(f, join(snapDir, `${layer}.jsonl`));
    }
    return snapDir;
  }

  // Fold working memory into permanent knowledge (called on session close).
  consolidate() {
    if (!this.enabled) return 0;
    const working = this._read("working");
    let moved = 0;
    for (const w of working) {
      if (w.text) { this.remember(w.text, { source: "consolidated" }); moved++; }
    }
    // clear working layer
    writeFileSync(this._file("working"), "", "utf8");
    return moved;
  }

  stats() {
    const out = {};
    for (const layer of LAYERS) out[layer] = this._read(layer).length;
    return out;
  }
}

export default { KnowledgeMemory };
