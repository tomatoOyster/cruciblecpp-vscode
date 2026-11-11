export type DiagnosticSeverity = "error" | "warning" | "note";

export interface ParsedDiagnostic {
  severity: DiagnosticSeverity;
  file: string;
  line: number;
  column: number;
  message: string;
  includeStack: string[];
}

const diagnosticPattern =
  /^(.*):(\d+):(\d+):\s*(fatal error|error|warning|note):\s*(.*)$/;
const includedFromPattern = /^\s+included from\s+(.+)$/;

function severityOf(value: string): DiagnosticSeverity {
  if (value === "warning") {
    return "warning";
  }
  if (value === "note") {
    return "note";
  }
  return "error";
}

export function parseDiagnostics(stderr: string): ParsedDiagnostic[] {
  const result: ParsedDiagnostic[] = [];
  let current: ParsedDiagnostic | undefined;

  for (const rawLine of stderr.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const match = diagnosticPattern.exec(line);
    if (match) {
      current = {
        file: match[1],
        line: Number.parseInt(match[2], 10),
        column: Number.parseInt(match[3], 10),
        severity: severityOf(match[4]),
        message: match[5],
        includeStack: [],
      };
      result.push(current);
      continue;
    }
    const included = includedFromPattern.exec(line);
    if (included && current) {
      current.includeStack.push(included[1].trim());
    }
  }
  return result;
}

export function hasUnparsedError(stderr: string): boolean {
  return /(^|\n)\s*(error|fatal error):/i.test(stderr);
}
