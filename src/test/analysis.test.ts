import { describe, expect, it } from "vitest";

import { parseAnalysis } from "../core/analysis";
import {
  includeGraphHtml,
  macroAnimationHtml,
} from "../ui/analysisWebview";

const data = {
  version: 1,
  root: "C:\\work\\main.cpp",
  files: ["C:\\work\\main.cpp", "C:\\work\\a.h", "D:\\gcc\\include\\c++\\vector"],
  includes: [
    {
      from: "C:\\work\\main.cpp",
      to: "C:\\work\\a.h",
      line: 1,
      angled: false,
    },
  ],
  macros: [
    {
      macro: "FOO",
      file: "C:\\work\\main.cpp",
      line: 3,
      column: 5,
      depth: 1,
      replacement: "42",
    },
  ],
};

function scriptOf(html: string): string {
  const match = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html);
  if (!match) {
    throw new Error("script not found");
  }
  return match[1];
}

describe("analysis webviews", () => {
  it("parses analysis JSON", () => {
    expect(parseAnalysis(JSON.stringify(data))?.macros[0].macro).toBe("FOO");
  });

  it("generates syntactically valid macro animation JavaScript", () => {
    const html = macroAnimationHtml(data, "C:\\work\\main.cpp", "nonce123");
    expect(html).toContain("Macro expansion");
    expect(() => new Function(scriptOf(html))).not.toThrow();
  });

  it("generates syntactically valid include graph JavaScript", () => {
    const html = includeGraphHtml(data, "nonce123");
    expect(html).toContain("Include graph");
    expect(() => new Function(scriptOf(html))).not.toThrow();
  });
});
