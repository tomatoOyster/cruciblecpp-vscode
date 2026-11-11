import { spawn, type ChildProcess } from "node:child_process";

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child: ChildProcess;

    try {
      child = spawn(executable, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        code: -1,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const finish = (result: ProcessResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const onAbort = () => {
      child?.kill();
      finish({
        code: -1,
        stdout,
        stderr,
        error: "cancelled",
      });
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      finish({
        code: -1,
        stdout,
        stderr,
        error: error.message,
      });
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      finish({
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}
