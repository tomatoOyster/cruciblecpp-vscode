import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { buildPreprocessArgs, PreprocessSettings } from "../core/args";
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
});
