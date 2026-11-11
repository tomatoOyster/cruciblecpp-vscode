import * as fs from "node:fs";
import * as path from "node:path";

export function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function withWindowsExtension(candidate: string): string[] {
  if (process.platform !== "win32") {
    return [candidate];
  }
  if (path.extname(candidate)) {
    return [candidate];
  }
  return [candidate, `${candidate}.exe`];
}

export function findOnPath(names: string[]): string | undefined {
  const pathValue = process.env.PATH ?? "";
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) {
      continue;
    }
    for (const name of names) {
      for (const extension of extensions) {
        const candidate =
          process.platform === "win32" && !path.extname(name)
            ? path.join(directory, `${name}${extension}`)
            : path.join(directory, name);
        if (isFile(candidate)) {
          return candidate;
        }
      }
    }
  }
  return undefined;
}

export function resolveExecutable(
  configured: string,
  workspaceRoot: string | undefined,
): string | undefined {
  if (configured.trim()) {
    const expanded = configured.trim().replace(/^"(.*)"$/, "$1");
    const base = path.isAbsolute(expanded)
      ? expanded
      : path.resolve(workspaceRoot ?? process.cwd(), expanded);
    for (const candidate of withWindowsExtension(base)) {
      if (isFile(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  const names = ["cruciblecpp-preprocessor.exe", "cruciblecpp-preprocessor"];
  const roots = workspaceRoot
    ? [
        path.join(workspaceRoot, "build"),
        path.join(workspaceRoot, "bin"),
        workspaceRoot,
      ]
    : [];
  for (const root of roots) {
    for (const name of names) {
      const candidate = path.join(root, name);
      if (isFile(candidate)) {
        return candidate;
      }
    }
  }
  return findOnPath(names);
}

export function resolveGcc(
  configured: string,
  workspaceRoot: string | undefined,
): string | undefined {
  if (configured.trim()) {
    const expanded = configured.trim().replace(/^"(.*)"$/, "$1");
    const base = path.isAbsolute(expanded)
      ? expanded
      : path.resolve(workspaceRoot ?? process.cwd(), expanded);
    for (const candidate of withWindowsExtension(base)) {
      if (isFile(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }
  return findOnPath(["g++.exe", "g++", "gcc.exe", "gcc"]);
}

export function samePath(a: string, b: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}
