import * as path from "node:path";

export interface IncludeEdge {
  from: string;
  to: string;
  line: number;
  angled: boolean;
}

export interface MacroTraceEvent {
  macro: string;
  file: string;
  line: number;
  column: number;
  depth: number;
  replacement: string;
}

export interface AnalysisData {
  version: number;
  root: string;
  files: string[];
  includes: IncludeEdge[];
  macros: MacroTraceEvent[];
}

export function parseAnalysis(text: string): AnalysisData | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const data = value as Partial<AnalysisData>;
  if (
    data.version !== 1 ||
    typeof data.root !== "string" ||
    !Array.isArray(data.files) ||
    !Array.isArray(data.includes) ||
    !Array.isArray(data.macros)
  ) {
    return undefined;
  }
  return data as AnalysisData;
}

function normalize(value: string): string {
  const slash = value.replace(/\\/g, "/");
  return process.platform === "win32" ? slash.toLowerCase() : slash;
}

function sameFile(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return left === right || left.endsWith(`/${path.basename(right)}`) &&
    path.basename(left) === path.basename(right);
}

export function macroEventsForSource(
  data: AnalysisData,
  sourceFile: string,
): MacroTraceEvent[] {
  const local = data.macros.filter((event) => sameFile(event.file, sourceFile));
  return local.length > 0 ? local : data.macros;
}

export function isSystemHeader(file: string): boolean {
  const normalized = normalize(file);
  return (
    normalized.includes("/include/c++/") ||
    normalized.includes("/lib/gcc/") ||
    normalized.includes("/ucrt64/include/") ||
    normalized.includes("/mingw64/include/")
  );
}
