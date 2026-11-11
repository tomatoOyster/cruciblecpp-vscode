import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { buildPreprocessArgs, PreprocessSettings } from "../core/args";
import { parseAnalysis } from "../core/analysis";
import { emptyFlags } from "../core/compileCommands";
import { parseDiagnostics } from "../core/diagnostics";
import { resolveExecutable } from "../core/paths";
import { runProcess } from "../core/process";

const executable = path.resolve(
  process.cwd(),
  "..",
  "cruciblecpp-preprocessor",
  "build",
  "cruciblecpp-preprocessor.exe",
);

const settings: PreprocessSettings = {
  includeDirs: [],
  systemIncludeDirs: [],
  defines: [],
  undefines: [],
  standard: "c++20",
  lineMarkers: false,
  inputCharset: "UTF-8",
  executionCharset: "UTF-8",
  unsignedChar: false,
  extraArgs: [],
};

describe.skipIf(!fs.existsSync(executable))("CLI integration", () => {
  it("resolves and runs the real preprocessor", async () => {
    const resolved = resolveExecutable(executable, process.cwd());
    expect(resolved).toBe(executable);

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cruciblecpp-vscode-"));
    try {
      const source = path.join(directory, "main.cpp");
      const output = path.join(directory, "main.i");
      fs.writeFileSync(
        source,
        "#include <vector>\n#if 'a' != 97\n#error bad\n#endif\nint main(){return 0;}\n",
        "utf8",
      );

      const args = buildPreprocessArgs(
        source,
        output,
        settings,
        emptyFlags(),
      );
      const result = await runProcess(executable, args, directory);
      expect(result.code).toBe(0);
      expect(fs.existsSync(output)).toBe(true);
      expect(parseDiagnostics(result.stderr)).toEqual([]);
      expect(fs.readFileSync(output, "utf8")).toContain("int main");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("collects include edges and macro trace", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cruciblecpp-vscode-"));
    try {
      const source = path.join(directory, "analysis.cpp");
      const output = path.join(directory, "analysis.i");
      const analysis = path.join(directory, "analysis.json");
      fs.writeFileSync(
        source,
        '#include <vector>\n#define FOO 41\n#define BAR (FOO + 1)\n#if BAR\nint value = BAR;\n#endif\n',
        "utf8",
      );
      const args = buildPreprocessArgs(
        source,
        output,
        settings,
        emptyFlags(),
      );
      args.splice(args.length - 3, 0, "--analysis-json", analysis);
      const result = await runProcess(executable, args, directory);
      expect(result.code).toBe(0);
      const data = parseAnalysis(fs.readFileSync(analysis, "utf8"));
      expect(data).toBeDefined();
      expect(data?.includes.length).toBeGreaterThan(0);
      expect(data?.macros.some((event) => event.macro === "FOO")).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("parses a real preprocessing failure", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cruciblecpp-vscode-"));
    try {
      const source = path.join(directory, "broken.cpp");
      const output = path.join(directory, "broken.i");
      fs.writeFileSync(source, '#include "missing-header.h"\n', "utf8");
      const args = buildPreprocessArgs(
        source,
        output,
        settings,
        emptyFlags(),
      );
      const result = await runProcess(executable, args, directory);
      expect(result.code).not.toBe(0);
      const diagnostics = parseDiagnostics(result.stderr);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].file).toContain("broken.cpp");
      expect(diagnostics[0].message).toContain("missing-header.h");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
