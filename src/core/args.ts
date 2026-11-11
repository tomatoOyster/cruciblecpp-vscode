import { ToolchainFlags } from "./compileCommands";

export interface PreprocessSettings {
  includeDirs: string[];
  systemIncludeDirs: string[];
  defines: string[];
  undefines: string[];
  standard: string;
  lineMarkers: boolean;
  inputCharset: string;
  executionCharset: string;
  unsignedChar: boolean;
  extraArgs: string[];
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = process.platform === "win32" ? value.toLowerCase() : value;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

export function buildPreprocessArgs(
  sourceFile: string,
  outputFile: string,
  settings: PreprocessSettings,
  toolchain: ToolchainFlags,
): string[] {
  const args: string[] = [];
  if (!settings.lineMarkers) {
    args.push("-P");
  }

  for (const directory of dedupe([
    ...toolchain.includeDirs,
    ...settings.includeDirs,
  ])) {
    args.push("-I", directory);
  }
  for (const directory of dedupe([
    ...toolchain.systemIncludeDirs,
    ...settings.systemIncludeDirs,
  ])) {
    args.push("-isystem", directory);
  }
  for (const define of [...toolchain.defines, ...settings.defines]) {
    args.push("-D", define);
  }
  for (const undefine of [...toolchain.undefines, ...settings.undefines]) {
    args.push("-U", undefine);
  }
  for (const include of toolchain.includes) {
    args.push("-include", include);
  }

  const standard = settings.standard || toolchain.standard || "c++20";
  args.push(`-std=${standard}`);
  if (settings.inputCharset && settings.inputCharset !== "UTF-8") {
    args.push(`-finput-charset=${settings.inputCharset}`);
  }
  if (settings.executionCharset && settings.executionCharset !== "UTF-8") {
    args.push(`-fexec-charset=${settings.executionCharset}`);
  }
  if (settings.unsignedChar) {
    args.push("-funsigned-char");
  }
  args.push(...settings.extraArgs);
  args.push(sourceFile, "-o", outputFile);
  return args;
}

export function buildGccArgs(
  sourceFile: string,
  outputFile: string,
  settings: PreprocessSettings,
  toolchain: ToolchainFlags,
): string[] {
  const args: string[] = ["-E", "-P"];
  for (const directory of dedupe([
    ...toolchain.includeDirs,
    ...settings.includeDirs,
  ])) {
    args.push("-I", directory);
  }
  for (const directory of dedupe([
    ...toolchain.systemIncludeDirs,
    ...settings.systemIncludeDirs,
  ])) {
    args.push("-isystem", directory);
  }
  for (const define of [...toolchain.defines, ...settings.defines]) {
    args.push("-D", define);
  }
  for (const undefine of [...toolchain.undefines, ...settings.undefines]) {
    args.push("-U", undefine);
  }
  for (const include of toolchain.includes) {
    args.push("-include", include);
  }
  const standard = settings.standard || toolchain.standard || "c++20";
  args.push(`-std=${standard}`);
  if (settings.inputCharset && settings.inputCharset !== "UTF-8") {
    args.push(`-finput-charset=${settings.inputCharset}`);
  }
  if (settings.executionCharset && settings.executionCharset !== "UTF-8") {
    args.push(`-fexec-charset=${settings.executionCharset}`);
  }
  if (settings.unsignedChar) {
    args.push("-funsigned-char");
  }
  args.push(sourceFile, "-o", outputFile);
  return args;
}
