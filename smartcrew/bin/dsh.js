#!/usr/bin/env node
// SMARTCREW DEEPSEEK HARNESS — CLI (dsh)
import { createInterface } from "node:readline";
import { loadConfig } from "../src/config.js";
import { Agent } from "../src/agent.js";
import { startWeb } from "../src/web.js";

const argv = process.argv.slice(2);
const cmd = argv[0] || "help";

function banner(cfg) {
  console.log(`\n🚢 ${cfg.harness.name} v${cfg.harness.version}  (MIT · Developer Preview)`);
  console.log(`   Model is swappable — knowledge memory persists.\n`);
}

async function main() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error("Config error:", e.message);
    process.exit(1);
  }

  switch (cmd) {
    case "web": {
      banner(cfg);
      startWeb(cfg);
      break;
    }
    case "models": {
      const a = new Agent(cfg);
      banner(cfg);
      for (const m of a.switcher.list()) {
        const mark = m.active ? "➜" : " ";
        console.log(`${mark} ${m.id.padEnd(20)} ${m.label}`);
        console.log(`    provider=${m.provider} cost=${m.cost_tier} creds=${m.credentials}`);
      }
      break;
    }
    case "use": {
      const id = argv[1];
      const a = new Agent(cfg);
      try {
        const r = a.switcher.switchTo(id);
        console.log(JSON.stringify(r, null, 2));
        console.log("\nNote: knowledge memory preserved. Persist active_model in the config to make it default.");
      } catch (e) { console.error(e.message); process.exit(1); }
      break;
    }
    case "remember": {
      const text = argv.slice(1).join(" ");
      if (!text) { console.error("usage: dsh remember <text>"); process.exit(1); }
      const a = new Agent(cfg);
      const rec = a.memory.remember(text, { source: "cli" });
      console.log("Saved to knowledge memory:", rec.id);
      break;
    }
    case "memory": {
      const a = new Agent(cfg);
      console.log("Memory dir:", a.memory.dir);
      console.log("Layers:", JSON.stringify(a.memory.stats(), null, 2));
      const dec = a.memory.all("decisions").slice(-10);
      if (dec.length) {
        console.log("\nRecent decisions (provenance):");
        for (const d of dec) console.log(`  [${d.model}] ${d.decision}`);
      }
      break;
    }
    case "snapshot": {
      const a = new Agent(cfg);
      const dir = a.memory.snapshot("manual");
      console.log("Snapshot written:", dir);
      break;
    }
    case "chat": {
      const a = new Agent(cfg);
      banner(cfg);
      console.log(`Active model: ${a.switcher.activeId}. Commands: /use <id>, /models, /remember <t>, /mem, /exit\n`);
      const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });
      rl.prompt();
      rl.on("line", async (line) => {
        const t = line.trim();
        if (!t) return rl.prompt();
        if (t === "/exit") { const c = a.close(); console.log("consolidated:", c.consolidated); return rl.close(); }
        if (t === "/models") { for (const m of a.switcher.list()) console.log(`${m.active ? "➜" : " "} ${m.id} — ${m.label} (${m.credentials})`); return rl.prompt(); }
        if (t.startsWith("/use ")) { try { console.log(JSON.stringify(a.use(t.slice(5).trim()))); } catch (e) { console.log(e.message); } return rl.prompt(); }
        if (t.startsWith("/remember ")) { a.memory.remember(t.slice(10)); console.log("(saved)"); return rl.prompt(); }
        if (t === "/mem") { console.log(a.memory.stats()); return rl.prompt(); }
        try { const r = await a.ask(t); console.log(`\n[${r.model}] ${r.text}\n`); }
        catch (e) { console.log("error:", e.message); }
        rl.prompt();
      });
      break;
    }
    case "help":
    default: {
      banner(cfg);
      console.log(`Usage: dsh <command>

  web                 start the local web UI (port ${cfg.runtime?.web_port || 3080})
  chat                interactive terminal chat
  models              list configured models + credential status
  use <model-id>      switch active model (memory preserved)
  remember <text>     add a permanent knowledge entry
  memory              show memory layer stats + recent decisions
  snapshot            snapshot the memory to disk
  help                this message

Config: smartcrew.config.toml   |   Read SAFETY.md before running.`);
    }
  }
}

main();
