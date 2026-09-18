// ============================================================================
//  ModelSwitcher — swap the active model WITHOUT losing knowledge memory.
//
//  Guarantees on every switch (per [switching] in the config):
//    1. persist_memory_on_switch   -> snapshot memory to disk first
//    2. rehydrate_memory_on_switch -> rebuild knowledge context for the new
//                                     model so decisions keep their basis
//    3. track_provenance           -> log which model becomes active and when
//
//  The model is a replaceable "brain"; the memory is the persistent "mind".
// ============================================================================
import { getModel } from "./config.js";
import { ModelClient } from "./model.js";

export class ModelSwitcher {
  constructor(cfg, memory) {
    this.cfg = cfg;
    this.memory = memory;
    this.sw = cfg.switching || {};
    const startId =
      this.sw.active_model ||
      (cfg.model.find((m) => m.default) || cfg.model[0]).id;
    this.activeId = startId;
    this.client = new ModelClient(getModel(cfg, this.activeId));
  }

  current() {
    return this.client;
  }

  list() {
    return this.cfg.model.map((m) => ({
      ...new ModelClient(m).describe(),
      active: m.id === this.activeId,
      default: Boolean(m.default),
    }));
  }

  // Switch active model losslessly.
  switchTo(id) {
    if (id === this.activeId) return { switched: false, active: id, note: "already active" };
    const target = getModel(this.cfg, id); // throws if unknown

    let snapshot = null;
    if (this.sw.persist_memory_on_switch !== false) {
      snapshot = this.memory.snapshot(`before-switch-to-${id}`);
    }

    const previous = this.activeId;
    this.activeId = id;
    this.client = new ModelClient(target);

    if (this.sw.track_provenance !== false) {
      this.memory.recordDecision({
        decision: `Switched active model: ${previous} -> ${id}`,
        rationale: "Model swap; knowledge memory preserved and rehydrated.",
        model: id,
      });
    }

    let rehydrated = false;
    if (this.sw.rehydrate_memory_on_switch !== false) {
      // Context is rebuilt on demand at call time via memory.buildContext(),
      // so the new model immediately sees the same knowledge basis.
      rehydrated = true;
    }

    return { switched: true, from: previous, active: id, snapshot, rehydrated };
  }

  // Optional auto-routing based on task hints and [[switching.route]] rules.
  route(taskHints = {}) {
    if (!this.sw.enabled || !Array.isArray(this.sw.route)) return this.activeId;
    for (const rule of this.sw.route) {
      if (this._matches(rule.when, taskHints)) return rule.use;
    }
    return this.activeId;
  }

  // Very small, safe expression evaluator for route rules. Supports the
  // limited grammar used in the config (&&, ||, ==, boolean flags, dotted keys).
  _matches(expr, hints) {
    if (!expr) return false;
    const ctx = {
      task: hints.task || {},
      runtime: this.cfg.runtime || {},
    };
    const get = (path) =>
      path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);

    const orParts = expr.split("||");
    return orParts.some((orp) =>
      orp.split("&&").every((cond) => {
        const c = cond.trim();
        const eq = c.match(/^(.+?)==(.+)$/);
        if (eq) {
          const left = get(eq[1].trim());
          let right = eq[2].trim().replace(/^['"]|['"]$/g, "");
          return String(left) === right;
        }
        // bare truthy flag, e.g. task.needs_polish
        return Boolean(get(c));
      })
    );
  }
}

export default { ModelSwitcher };
