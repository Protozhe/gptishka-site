export function minifyCss(css) {
  let output = "";
  let quote = "";
  let pendingSpace = false;

  const noSpaceBefore = new Set(["{", "}", ":", ";", ",", ">", "+", "~", ")"]);
  const noSpaceAfter = new Set(["{", "}", ":", ";", ",", ">", "+", "~", "("]);

  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    const next = css[index + 1] || "";

    if (quote) {
      output += char;
      if (char === "\\") {
        output += next;
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (pendingSpace && output && !noSpaceAfter.has(output.at(-1))) output += " ";
      pendingSpace = false;
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = css.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Unterminated CSS comment.");
      const comment = css.slice(index, end + 2);
      if (comment.startsWith("/*!")) output += comment;
      index = end + 1;
      pendingSpace = true;
      continue;
    }

    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }

    if (pendingSpace) {
      const previous = output.at(-1) || "";
      if (previous && !noSpaceAfter.has(previous) && !noSpaceBefore.has(char)) output += " ";
      pendingSpace = false;
    }

    if (char === "}" && output.endsWith(";")) output = output.slice(0, -1);
    output += char;
  }

  return output.trim();
}
