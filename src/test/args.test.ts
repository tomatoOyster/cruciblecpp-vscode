import { describe, expect, it } from "vitest";

import { buildGccArgs, buildPreprocessArgs, PreprocessSettings } from "../core/args";
import { emptyFlags } from "../core/compileCommands";

const settings: PreprocessSettings = {
  includeDirs: ["include"],
  systemIncludeDirs: ["sys"],
  defines: ["FOO=1"],
  undefines: ["BAR"],
  standard: "c++20",
  lineMarkers: false,
  inputCharset: "GBK",
  executionCharset: "GBK",
  unsignedChar: true,
  extraArgs: ["--strict"],
};

describe("argument builder", () => {
  it("builds preprocessor arguments", () => {
    const flags = emptyFlags();
    flags.includeDirs = ["generated"];
    flags.defines = ["FROM_CC=1"];
    const args = buildPreprocessArgs("main.cpp", "main.i", settings, flags);
    expect(args).toEqual([
      "-P",
      "-I",
      "generated",
      "-I",
      "include",
      "-isystem",
      "sys",
      "-D",
      "FROM_CC=1",
      "-D",
      "FOO=1",
      "-U",
      "BAR",
      "-std=c++20",
      "-finput-charset=GBK",
      "-fexec-charset=GBK",
      "-funsigned-char",
      "--strict",
      "main.cpp",
      "-o",
      "main.i",
    ]);
  });

  it("builds g++ comparison arguments", () => {
    const args = buildGccArgs("main.cpp", "gcc.i", settings, emptyFlags());
    expect(args.slice(0, 2)).toEqual(["-E", "-P"]);
    expect(args).toContain("-std=c++20");
    expect(args).toContain("-funsigned-char");
    expect(args.slice(-3)).toEqual(["main.cpp", "-o", "gcc.i"]);
  });
});
