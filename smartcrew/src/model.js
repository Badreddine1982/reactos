// Model adapter: a thin, provider-agnostic wrapper over an OpenAI-compatible
// chat API. DeepSeek, OpenAI, and Ollama all expose /chat/completions;
// Anthropic uses a different shape and is handled separately.
//
// The adapter is deliberately "dumb": it holds NO memory. All knowledge lives
// in KnowledgeMemory and is injected per-call. That is what makes the model
// hot-swappable without any knowledge loss.

export class ModelClient {
  constructor(modelCfg) {
    this.cfg = modelCfg;
    this.id = modelCfg.id;
    this.provider = modelCfg.provider;
    this.apiKey = modelCfg.api_key_env ? process.env[modelCfg.api_key_env] || "" : "";
  }

  hasCredentials() {
    if (this.provider === "ollama") return true; // local, no key needed
    return Boolean(this.apiKey);
  }

  describe() {
    return {
      id: this.id,
      provider: this.provider,
      label: this.cfg.label,
      model: this.cfg.model,
      context_window: this.cfg.context_window,
      cost_tier: this.cfg.cost_tier,
      credentials: this.hasCredentials() ? "ok" : `missing (${this.cfg.api_key_env})`,
    };
  }

  // messages: [{role, content}]. Returns { text }.
  async complete(messages, { temperature = 0.7, maxTokens = 1024 } = {}) {
    if (!this.hasCredentials()) {
      throw new Error(
        `Model "${this.id}" has no credentials. Set env ${this.cfg.api_key_env}.`
      );
    }
    if (this.provider === "anthropic") return this._anthropic(messages, temperature, maxTokens);
    return this._openaiCompatible(messages, temperature, maxTokens);
  }

  async _openaiCompatible(messages, temperature, maxTokens) {
    const url = `${this.cfg.base_url.replace(/\/$/, "")}/chat/completions`;
    const headers = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.cfg.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw new Error(`${this.provider} error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content ?? "", raw: data };
  }

  async _anthropic(messages, temperature, maxTokens) {
    const url = `${this.cfg.base_url.replace(/\/$/, "")}/messages`;
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.cfg.model,
        system,
        messages: rest,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw new Error(`anthropic error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = (data.content || []).map((c) => c.text || "").join("");
    return { text, raw: data };
  }
}

export default { ModelClient };
