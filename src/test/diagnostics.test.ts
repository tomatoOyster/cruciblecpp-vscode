import { describe, expect, it } from "vitest";

import { parseDiagnostics } from "../core/diagnostics";

describe("diagnostic parser", () => {
  it("parses Windows paths and include stacks", () => {
    const stderr = [
      "C:\\work\\main.cpp:10:5: error: cannot find include file 'x.h'",
      "  included from C:\\work\\a.h",
      "  included from C:\\work\\main.cpp",
      "C:\\work\\main.cpp:20:2: warning: test warning",
    ].join("\r\n");

    const parsed = parseDiagnostics(stderr);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      file: "C:\\work\\main.cpp",
      line: 10,
      column: 5,
      severity: "error",
    });
    expect(parsed[0].includeStack).toEqual([
      "C:\\work\\a.h",
      "C:\\work\\main.cpp",
    ]);
    expect(parsed[1].severity).toBe("warning");
  });

  it("ignores unrelated compiler output", () => {
    expect(parseDiagnostics("CrucibleCpp: processed 2 file(s)")).toEqual([]);
  });
});
