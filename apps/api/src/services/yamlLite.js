/**
 * Minimal YAML subset parser for registry agent.yaml files.
 * Supports nested maps, arrays, scalars, and quoted strings.
 * Not a full YAML 1.2 implementation — sufficient for practice-library manifests.
 */
export function parse(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));

  let i = 0;

  function indentOf(line) {
    return line.match(/^\s*/)[0].length;
  }

  function parseValue(raw) {
    const v = raw.trim();
    if (v === "null" || v === "~") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      return v.slice(1, -1);
    }
    return v;
  }

  function parseBlock(minIndent) {
    const obj = {};
    let arr = null;

    while (i < lines.length) {
      const line = lines[i];
      const ind = indentOf(line);
      if (ind < minIndent) break;

      const trimmed = line.trim();

      if (trimmed.startsWith("- ")) {
        if (!arr) arr = [];
        const rest = trimmed.slice(2);
        if (rest.includes(": ") || rest.endsWith(":")) {
          // inline map start in list item — treat as nested object of one key
          const key = rest.replace(/:$/, "").split(":")[0].trim();
          const after = rest.includes(":")
            ? rest.slice(rest.indexOf(":") + 1).trim()
            : "";
          i += 1;
          if (after) {
            arr.push({ [key]: parseValue(after) });
          } else {
            const nested = parseBlock(ind + 1);
            arr.push({ [key]: nested });
          }
        } else {
          arr.push(parseValue(rest));
          i += 1;
        }
        continue;
      }

      if (arr) {
        // finished array context when we see a key at same indent
        break;
      }

      const colon = trimmed.indexOf(":");
      if (colon === -1) {
        i += 1;
        continue;
      }

      const key = trimmed.slice(0, colon).trim();
      const after = trimmed.slice(colon + 1).trim();
      i += 1;

      if (after === "" || after === "|" || after === ">") {
        // peek next
        if (i < lines.length && indentOf(lines[i]) > ind) {
          const nextTrim = lines[i].trim();
          if (nextTrim.startsWith("- ")) {
            const list = [];
            while (i < lines.length && indentOf(lines[i]) > ind) {
              const l = lines[i].trim();
              if (!l.startsWith("- ")) break;
              list.push(parseValue(l.slice(2)));
              i += 1;
            }
            obj[key] = list;
          } else {
            obj[key] = parseBlock(ind + 1);
          }
        } else {
          obj[key] = null;
        }
      } else if (after.startsWith("[") && after.endsWith("]")) {
        const inner = after.slice(1, -1).trim();
        obj[key] = inner
          ? inner.split(",").map((s) => parseValue(s.trim()))
          : [];
      } else {
        obj[key] = parseValue(after);
      }
    }

    return arr || obj;
  }

  return parseBlock(0);
}

export default { parse };
