// Agent Loop — ties Model + Memory + Tools together (Cordis-style).
// On each turn it: builds knowledge context from memory (model-agnostic),
// prepends it, calls the ACTIVE model, then records the turn back to memory.
import { KnowledgeMemory } from "./memory.js";
import { ModelSwitcher } from "./switcher.js";
import { defaultModelId } from "./config.js";

export class Agent {
  constructor(cfg) {
    this.cfg = cfg;
    this.memory = new KnowledgeMemory(cfg);
    this.switcher = new ModelSwitcher(cfg, this.memory);
    this.history = [];
  }

  systemPrompt() {
    return (
      `You are ${this.cfg.harness.name}, an agent whose knowledge memory is ` +
      `stored outside of you and injected below. Base decisions on it. ` +
      `Active model: ${this.switcher.activeId}.`
    );
  }

  // Build the full message list for the active model. The injected knowledge
  // block is identical regardless of which model is active => lossless switch.
  buildMessages(userText) {
    const knowledge = this.memory.buildContext(userText);
    const messages = [{ role: "system", content: this.systemPrompt() }];
    if (knowledge) {
      messages.push({ role: "system", content: `# Knowledge memory\n${knowledge}` });
    }
    for (const h of this.history.slice(-10)) messages.push(h);
    messages.push({ role: "user", content: userText });
    return messages;
  }

  async ask(userText, opts = {}) {
    // optional auto-route to a better-suited model for this task
    if (opts.taskHints) {
      const target = this.switcher.route(opts.taskHints);
      if (target !== this.switcher.activeId) this.switcher.switchTo(target);
    }

    this.memory.note(`User: ${userText}`);
    const messages = this.buildMessages(userText);
    const { text } = await this.switcher.current().complete(messages, opts);

    this.history.push({ role: "user", content: userText });
    this.history.push({ role: "assistant", content: text });
    this.memory.note(`Assistant(${this.switcher.activeId}): ${text.slice(0, 500)}`);
    return { text, model: this.switcher.activeId };
  }

  use(modelId) {
    return this.switcher.switchTo(modelId);
  }

  close() {
    const moved = this.memory.consolidate();
    return { consolidated: moved };
  }
}

export function createAgent(cfg) {
  return new Agent(cfg);
}

export default { Agent, createAgent };
