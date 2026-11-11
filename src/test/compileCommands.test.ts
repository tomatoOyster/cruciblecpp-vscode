import { describe, expect, it } from "vitest";

import {
  extractFlags,
  splitCommandLine,
} from "../core/compileCommands";

describe("compile_commands support", () => {
  it("splits a Windows command line", () => {
    expect(
      splitCommandLine(
        'g++.exe -I"C:\\Program Files\\include" -DNAME="a b" "C:\\work\\main.cpp"',
      ),
    ).toEqual([
      "g++.exe",
      "-IC:\\Program Files\\include",
      "-DNAME=a b",
      "C:\\work\\main.cpp",
    ]);
  });

  it("extracts only supported flags", () => {
    const flags = extractFlags(
      {
        directory: "C:\\work",
        file: "C:\\work\\main.cpp",
        arguments: [
          "g++.exe",
          "-IC:/work/include",
          "-isystem",
          "C:/sys",
          "-D",
          "FOO=1",
          "-U",
          "BAR",
          "-std=c++20",
          "-finput-charset=GBK",
          "-fexec-charset=GBK",
          "-funsigned-char",
          "-include",
          "C:/work/force.h",
          "-O2",
          "C:/work/main.cpp",
        ],
      },
      "C:\\work",
    );
    expect(flags.includeDirs).toEqual(["C:\\work\\include"]);
    expect(flags.systemIncludeDirs).toEqual(["C:\\sys"]);
    expect(flags.defines).toEqual(["FOO=1"]);
    expect(flags.undefines).toEqual(["BAR"]);
    expect(flags.includes).toEqual(["C:\\work\\force.h"]);
    expect(flags.standard).toBe("c++20");
    expect(flags.inputCharset).toBe("GBK");
    expect(flags.executionCharset).toBe("GBK");
    expect(flags.unsignedChar).toBe(true);
  });
});
