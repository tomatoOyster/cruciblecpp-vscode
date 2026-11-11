import * as fs from "node:fs";
import * as path from "node:path";

export interface ToolchainFlags {
  includeDirs: string[];
  systemIncludeDirs: string[];
  defines: string[];
  undefines: string[];
  includes: string[];
  standard?: string;
  inputCharset?: string;
  executionCharset?: string;
  unsignedChar?: boolean;
}

interface CompileCommandEntry {
  directory?: string;
  file: string;
  arguments?: string[];
  command?: string;
}

export function emptyFlags(): ToolchainFlags {
  return {
    includeDirs: [],
    systemIncludeDirs: [],
    defines: [],
    undefines: [],
    includes: [],
  };
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

export function findCompileCommands(
  workspaceRoot: string,
  configured: string,
): string | undefined {
  if (configured.trim()) {
    const candidate = path.isAbsolute(configured)
      ? configured
      : path.resolve(workspaceRoot, configured);
    return fs.existsSync(candidate) ? candidate : undefined;
  }

  const candidates = [
    path.join(workspaceRoot, "compile_commands.json"),
    path.join(workspaceRoot, "build", "compile_commands.json"),
    path.join(workspaceRoot, "out", "build", "compile_commands.json"),
    path.join(workspaceRoot, "cmake-build-debug", "compile_commands.json"),
    path.join(workspaceRoot, "cmake-build-release", "compile_commands.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const skip = new Set([".git", "node_modules", ".cache", "dist", "out"]);
  const walk = (directory: string, depth: number): string | undefined => {
    if (depth < 0) {
      return undefined;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return undefined;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name === "compile_commands.json") {
        return path.join(directory, entry.name);
      }
    }
    if (depth === 0) {
      return undefined;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !skip.has(entry.name)) {
        const found = walk(path.join(directory, entry.name), depth - 1);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  };
  return walk(workspaceRoot, 3);
}

function normalizePath(value: string, root: string): string {
  const unquoted = unquote(value);
  const absolute = path.isAbsolute(unquoted)
    ? unquoted
    : path.resolve(root, unquoted);
  return path.normalize(absolute);
}

export function extractFlags(
  entry: CompileCommandEntry,
  workspaceRoot: string,
): ToolchainFlags {
  const flags = emptyFlags();
  const args = entry.arguments ?? (entry.command ? splitCommandLine(entry.command) : []);
  const root = entry.directory
    ? path.resolve(workspaceRoot, entry.directory)
    : workspaceRoot;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-I" && i + 1 < args.length) {
      flags.includeDirs.push(normalizePath(args[++i], root));
    } else if (arg.startsWith("-I") && arg.length > 2) {
      flags.includeDirs.push(normalizePath(arg.slice(2), root));
    } else if (arg === "-isystem" && i + 1 < args.length) {
      flags.systemIncludeDirs.push(normalizePath(args[++i], root));
    } else if (arg.startsWith("-isystem") && arg.length > 8) {
      flags.systemIncludeDirs.push(normalizePath(arg.slice(8), root));
    } else if (arg === "-D" && i + 1 < args.length) {
      flags.defines.push(args[++i]);
    } else if (arg.startsWith("-D") && arg.length > 2) {
      flags.defines.push(arg.slice(2));
    } else if (arg === "-U" && i + 1 < args.length) {
      flags.undefines.push(args[++i]);
    } else if (arg.startsWith("-U") && arg.length > 2) {
      flags.undefines.push(arg.slice(2));
    } else if (arg === "-include" && i + 1 < args.length) {
      flags.includes.push(normalizePath(args[++i], root));
    } else if (arg.startsWith("-include") && arg.length > 8) {
      flags.includes.push(normalizePath(arg.slice(8), root));
    } else if (arg.startsWith("-std=")) {
      flags.standard = arg.slice(5);
    } else if (arg.startsWith("-finput-charset=")) {
      flags.inputCharset = arg.slice("-finput-charset=".length);
    } else if (arg.startsWith("-fexec-charset=")) {
      flags.executionCharset = arg.slice("-fexec-charset=".length);
    } else if (arg === "-funsigned-char") {
      flags.unsignedChar = true;
    } else if (arg === "-fsigned-char") {
      flags.unsignedChar = false;
    }
  }

  return flags;
}

export function readCompileCommands(
  file: string,
  sourceFile: string,
  workspaceRoot: string,
): ToolchainFlags {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return emptyFlags();
  }
  if (!Array.isArray(parsed)) {
    return emptyFlags();
  }

  const normalizedSource = path.resolve(sourceFile);
  const entries = parsed as CompileCommandEntry[];
  const exact = entries.find(
    (entry) =>
      typeof entry.file === "string" &&
      path.resolve(
        entry.directory ? path.resolve(workspaceRoot, entry.directory) : workspaceRoot,
        entry.file,
      ).toLowerCase() === normalizedSource.toLowerCase(),
  );
  const selected =
    exact ??
    entries.find(
      (entry) =>
        typeof entry.file === "string" &&
        path.basename(entry.file).toLowerCase() ===
          path.basename(normalizedSource).toLowerCase(),
    );
  return selected ? extractFlags(selected, workspaceRoot) : emptyFlags();
}

// Parse a Windows-style command line as found in compile_commands.json.
// Handles quotes and the backslash-before-quote escaping used by MSVC/CMake.
export function splitCommandLine(command: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let backslashes = 0;

  const flush = () => {
    if (current.length > 0) {
      result.push(current);
      current = "";
    }
  };

  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (c === "\\") {
      backslashes += 1;
      continue;
    }
    if (c === '"') {
      if (backslashes % 2 === 1) {
        current += "\\".repeat((backslashes - 1) / 2);
        current += '"';
      } else {
        current += "\\".repeat(backslashes / 2);
        inQuotes = !inQuotes;
      }
      backslashes = 0;
      continue;
    }
    if (!inQuotes && (c === " " || c === "\t")) {
      current += "\\".repeat(backslashes);
      backslashes = 0;
      flush();
      continue;
    }
    current += "\\".repeat(backslashes);
    backslashes = 0;
    current += c;
  }
  current += "\\".repeat(backslashes);
  flush();
  return result;
}
