// Minimal, dependency-free TOML parser — enough for smartcrew.config.toml.
// Supports: tables [a.b], array-of-tables [[a.b]], key = value,
// strings, numbers, booleans, and inline arrays. Comments start with #.
// This is intentionally small; for full TOML use a library in production.

function parseValue(raw) {
  const s = raw.trim();
  if (s === "") return "";
  if (s === "true") return true;
  if (s === "false") return false;
  // string
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  // array
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "") return [];
    return splitTopLevel(inner).map((x) => parseValue(x));
  }
  // number
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

// Split on commas that are not inside quotes or brackets.
function splitTopLevel(str) {
  const out = [];
  let depth = 0, quote = null, cur = "";
  for (const ch of str) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

// strip a trailing comment that is outside of quotes
function stripComment(line) {
  let quote = null, out = "";
  for (const ch of line) {
    if (quote) { out += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; continue; }
    if (ch === "#") break;
    out += ch;
  }
  return out;
}

function setPath(root, pathParts, value) {
  let node = root;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (!(key in node) || typeof node[key] !== "object" || Array.isArray(node[key])) {
      node[key] = {};
    }
    node = node[key];
  }
  node[pathParts[pathParts.length - 1]] = value;
}

function getContainer(root, pathParts) {
  let node = root;
  for (const key of pathParts) {
    if (Array.isArray(node[key])) {
      node = node[key][node[key].length - 1]; // last element of array-of-tables
    } else {
      if (!(key in node) || typeof node[key] !== "object") node[key] = {};
      node = node[key];
    }
  }
  return node;
}

export function parseTOML(text) {
  const root = {};
  let current = root;

  const lines = text.split(/\r?\n/);
  for (let raw of lines) {
    const line = stripComment(raw).trim();
    if (line === "") continue;

    // array of tables [[a.b]]
    if (line.startsWith("[[") && line.endsWith("]]")) {
      const parts = line.slice(2, -2).trim().split(".").map((p) => p.trim());
      const parent = getContainer(root, parts.slice(0, -1));
      const key = parts[parts.length - 1];
      if (!Array.isArray(parent[key])) parent[key] = [];
      const obj = {};
      parent[key].push(obj);
      current = obj;
      continue;
    }

    // table [a.b]
    if (line.startsWith("[") && line.endsWith("]")) {
      const parts = line.slice(1, -1).trim().split(".").map((p) => p.trim());
      current = getContainer(root, parts);
      continue;
    }

    // key = value
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^["']|["']$/g, "");
    const value = parseValue(line.slice(eq + 1));
    setPath(current, [key], value);
  }
  return root;
}

export default { parseTOML };
