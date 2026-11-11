import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { buildGccArgs, buildPreprocessArgs, PreprocessSettings } from "./core/args";
import {
  emptyFlags,
  findCompileCommands,
  readCompileCommands,
  ToolchainFlags,
} from "./core/compileCommands";
import { parseAnalysis } from "./core/analysis";
import { parseDiagnostics } from "./core/diagnostics";
import { resolveExecutable, resolveGcc } from "./core/paths";
import { runProcess, ProcessResult } from "./core/process";
import {
  includeGraphHtml,
  macroAnimationHtml,
} from "./ui/analysisWebview";

const PREVIEW_SCHEME = "cruciblecpp-preview";

class PreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this.changed.fire(uri);
  }
}

interface Outcome {
  result: ProcessResult;
  outputPath: string;
  text: string;
  cancelled: boolean;
}

let outputChannel: vscode.OutputChannel;
let diagnosticCollection: vscode.DiagnosticCollection;
let previewProvider: PreviewProvider;
let statusBar: vscode.StatusBarItem;

function configuration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("cruciblecpp");
}

function resolveUserPath(root: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function settingsFor(root: string): PreprocessSettings {
  const config = configuration();
  const standard = config.get<string>("standard", "default");
  return {
    includeDirs: config
      .get<string[]>("includeDirs", [])
      .map((value) => resolveUserPath(root, value)),
    systemIncludeDirs: config
      .get<string[]>("systemIncludeDirs", [])
      .map((value) => resolveUserPath(root, value)),
    defines: config.get<string[]>("defines", []),
    undefines: config.get<string[]>("undefines", []),
    standard: standard === "default" ? "" : standard,
    lineMarkers: config.get<boolean>("lineMarkers", false),
    inputCharset: config.get<string>("inputCharset", "UTF-8"),
    executionCharset: config.get<string>("executionCharset", "UTF-8"),
    unsignedChar: config.get<boolean>("unsignedChar", false),
    extraArgs: config.get<string[]>("extraArgs", []),
  };
}

function workspaceRoot(document: vscode.TextDocument): string {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  return folder?.uri.fsPath ?? path.dirname(document.uri.fsPath);
}

function toolchainFor(
  document: vscode.TextDocument,
  root: string,
): ToolchainFlags {
  if (!configuration().get<boolean>("useCompileCommands", true)) {
    return emptyFlags();
  }
  const configured = configuration().get<string>("compileCommandsPath", "");
  const compileCommands = findCompileCommands(root, configured);
  if (!compileCommands) {
    return emptyFlags();
  }
  outputChannel.appendLine(`Using compile_commands: ${compileCommands}`);
  return readCompileCommands(compileCommands, document.uri.fsPath, root);
}

async function ensureSaved(document: vscode.TextDocument): Promise<boolean> {
  if (document.uri.scheme === "untitled") {
    vscode.window.showErrorMessage(
      "CrucibleCpp: save the file before preprocessing.",
    );
    return false;
  }
  if (!document.isDirty) {
    return true;
  }
  if (!configuration().get<boolean>("saveBeforePreprocess", true)) {
    const choice = await vscode.window.showWarningMessage(
      "CrucibleCpp: the document has unsaved changes. Preprocess the saved version?",
      "Save and Continue",
      "Cancel",
    );
    if (choice !== "Save and Continue") {
      return false;
    }
  }
  return document.save();
}

function temporaryOutput(document: vscode.TextDocument, tag: string): string {
  const base = path.basename(document.uri.fsPath, path.extname(document.uri.fsPath));
  const hash = crypto
    .createHash("sha1")
    .update(document.uri.fsPath)
    .digest("hex")
    .slice(0, 8);
  const directory = path.join(os.tmpdir(), "cruciblecpp-vscode");
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, `${base}-${hash}-${tag}.i`);
}

function previewUri(document: vscode.TextDocument): vscode.Uri {
  const hash = crypto
    .createHash("sha1")
    .update(document.uri.fsPath)
    .digest("hex")
    .slice(0, 8);
  return vscode.Uri.from({
    scheme: PREVIEW_SCHEME,
    path: `/${path.basename(document.uri.fsPath)}.${hash}.i`,
  });
}

function resolveTool(
  kind: "preprocessor" | "gcc",
  root: string,
): string | undefined {
  const config = configuration();
  if (kind === "preprocessor") {
    const executable = resolveExecutable(
      config.get<string>("executable", ""),
      root,
    );
    if (!executable) {
      vscode.window
        .showErrorMessage(
          "CrucibleCpp: cannot find cruciblecpp-preprocessor.exe. Configure cruciblecpp.executable.",
          "Open Settings",
        )
        .then((choice) => {
          if (choice === "Open Settings") {
            void vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "cruciblecpp.executable",
            );
          }
        });
    }
    return executable;
  }
  const gcc = resolveGcc(config.get<string>("gccPath", ""), root);
  if (!gcc) {
    vscode.window.showErrorMessage(
      "CrucibleCpp: cannot find g++. Configure cruciblecpp.gccPath.",
    );
  }
  return gcc;
}

function publishDiagnostics(
  document: vscode.TextDocument,
  stderr: string,
  root: string,
): void {
  diagnosticCollection.clear();
  const parsed = parseDiagnostics(stderr);
  const byFile = new Map<
    string,
    { file: string; diagnostics: vscode.Diagnostic[] }
  >();

  for (const item of parsed) {
    if (item.file === "<command line>") {
      continue;
    }
    const file = path.isAbsolute(item.file)
      ? item.file
      : path.resolve(root, item.file);
    const line = Math.max(0, item.line - 1);
    const column = Math.max(0, item.column - 1);
    const range = new vscode.Range(
      line,
      column,
      line,
      Math.max(column + 1, 1),
    );
    const severity =
      item.severity === "error"
        ? vscode.DiagnosticSeverity.Error
        : item.severity === "warning"
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;
    const diagnostic = new vscode.Diagnostic(range, item.message, severity);
    diagnostic.source = "CrucibleCpp";
    if (item.includeStack.length > 0) {
      diagnostic.relatedInformation = item.includeStack.map((stackFile) => {
        const stackPath = path.isAbsolute(stackFile)
          ? stackFile
          : path.resolve(root, stackFile);
        return new vscode.DiagnosticRelatedInformation(
          new vscode.Location(vscode.Uri.file(stackPath), new vscode.Position(0, 0)),
          `included from ${stackFile}`,
        );
      });
    }
    const key = process.platform === "win32" ? file.toLowerCase() : file;
    const entry = byFile.get(key) ?? { file, diagnostics: [] };
    entry.diagnostics.push(diagnostic);
    byFile.set(key, entry);
  }

  for (const entry of byFile.values()) {
    diagnosticCollection.set(
      vscode.Uri.file(entry.file),
      entry.diagnostics,
    );
  }

  if (byFile.size === 0 && stderr.trim()) {
    const firstLine = stderr.split(/\r?\n/).find((line) => line.trim()) ?? "";
    if (firstLine) {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        firstLine.trim(),
        vscode.DiagnosticSeverity.Error,
      );
      diagnostic.source = "CrucibleCpp";
      diagnosticCollection.set(document.uri, [diagnostic]);
    }
  }
  if (stderr.trim()) {
    outputChannel.appendLine(stderr.trimEnd());
  }
}

async function preprocessDocument(
  document: vscode.TextDocument,
  lineMarkers?: boolean,
  analysisPath?: string,
): Promise<Outcome | undefined> {
  if (!(await ensureSaved(document))) {
    return undefined;
  }
  const root = workspaceRoot(document);
  const executable = resolveTool("preprocessor", root);
  if (!executable) {
    return undefined;
  }

  const toolchain = toolchainFor(document, root);
  const settings = settingsFor(root);
  if (lineMarkers !== undefined) {
    settings.lineMarkers = lineMarkers;
  }
  const outputPath = temporaryOutput(document, "preview");
  const args = buildPreprocessArgs(
    document.uri.fsPath,
    outputPath,
    settings,
    toolchain,
  );
  if (analysisPath) {
    // buildPreprocessArgs ends with: <source> -o <output>
    args.splice(args.length - 3, 0, "--analysis-json", analysisPath);
  }

  outputChannel.appendLine(`> "${executable}" ${args.map((arg) => JSON.stringify(arg)).join(" ")}`);
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CrucibleCpp: preprocessing",
      cancellable: true,
    },
    async (_progress, token) => {
      const controller = new AbortController();
      const subscription = token.onCancellationRequested(() => controller.abort());
      try {
        return await runProcess(executable, args, root, controller.signal);
      } finally {
        subscription.dispose();
      }
    },
  );

  publishDiagnostics(document, result.stderr, root);
  let text = "";
  if (fs.existsSync(outputPath)) {
    text = fs.readFileSync(outputPath, "utf8");
  }
  const cancelled = result.error === "cancelled";
  if (cancelled) {
    vscode.window.showInformationMessage("CrucibleCpp: preprocessing cancelled.");
  } else if (result.error) {
    vscode.window.showErrorMessage(`CrucibleCpp: ${result.error}`);
  } else if (result.code !== 0) {
    vscode.window
      .showErrorMessage(
        `CrucibleCpp: preprocessing failed with exit code ${result.code}.`,
        "Show Output",
      )
      .then((choice) => {
        if (choice === "Show Output") {
          outputChannel.show();
        }
      });
  }
  return { result, outputPath, text, cancelled };
}

function showPreview(document: vscode.TextDocument, text: string): void {
  const uri = previewUri(document);
  previewProvider.set(uri, text);
  vscode.workspace.openTextDocument(uri).then((preview) => {
    void vscode.languages.setTextDocumentLanguage(preview, "cpp");
    void vscode.window.showTextDocument(preview, {
      preview: true,
      viewColumn: vscode.ViewColumn.Beside,
    });
  });
}

async function commandPreprocess(document: vscode.TextDocument): Promise<void> {
  const outcome = await preprocessDocument(document);
  if (!outcome || outcome.cancelled || outcome.result.code !== 0) {
    return;
  }
  statusBar.text = "CrucibleCpp: OK";
  vscode.window.showInformationMessage(
    "CrucibleCpp: preprocessing succeeded.",
    "Preview",
  ).then((choice) => {
    if (choice === "Preview") {
      showPreview(document, outcome.text);
    }
  });
}

async function commandPreview(document: vscode.TextDocument): Promise<void> {
  const outcome = await preprocessDocument(document);
  if (!outcome) {
    return;
  }
  if (outcome.text) {
    showPreview(document, outcome.text);
  }
  statusBar.text =
    outcome.result.code === 0 ? "CrucibleCpp: OK" : "CrucibleCpp: error";
}

async function commandSave(document: vscode.TextDocument): Promise<void> {
  const outcome = await preprocessDocument(document);
  if (!outcome || outcome.cancelled || outcome.result.code !== 0) {
    return;
  }
  const defaultUri = vscode.Uri.file(
    path.join(
      path.dirname(document.uri.fsPath),
      `${path.basename(document.uri.fsPath, path.extname(document.uri.fsPath))}.i`,
    ),
  );
  const destination = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { "Preprocessed C++": ["i"] },
  });
  if (!destination) {
    return;
  }
  fs.writeFileSync(destination.fsPath, outcome.text, "utf8");
  vscode.window.showInformationMessage(
    `CrucibleCpp: saved ${destination.fsPath}`,
  );
}

async function commandCompare(document: vscode.TextDocument): Promise<void> {
  if (!(await ensureSaved(document))) {
    return;
  }
  const root = workspaceRoot(document);
  const executable = resolveTool("preprocessor", root);
  const gcc = resolveTool("gcc", root);
  if (!executable || !gcc) {
    return;
  }
  const toolchain = toolchainFor(document, root);
  const settings = { ...settingsFor(root), lineMarkers: false };
  const oursPath = temporaryOutput(document, "ours");
  const gccPath = temporaryOutput(document, "gcc");
  const oursArgs = buildPreprocessArgs(
    document.uri.fsPath,
    oursPath,
    settings,
    toolchain,
  );
  const gccArgs = buildGccArgs(
    document.uri.fsPath,
    gccPath,
    settings,
    toolchain,
  );

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CrucibleCpp: comparing with g++ -E",
      cancellable: true,
    },
    async (_progress, token) => {
      const controller = new AbortController();
      const subscription = token.onCancellationRequested(() => controller.abort());
      try {
        const ours = await runProcess(executable, oursArgs, root, controller.signal);
        if (ours.code !== 0) {
          publishDiagnostics(document, ours.stderr, root);
          return { ours, gcc: undefined };
        }
        const gccResult = await runProcess(gcc, gccArgs, root, controller.signal);
        return { ours, gcc: gccResult };
      } finally {
        subscription.dispose();
      }
    },
  );
  if (!result.gcc) {
    return;
  }
  if (result.gcc.code !== 0) {
    outputChannel.appendLine(result.gcc.stderr);
    vscode.window.showErrorMessage(
      "CrucibleCpp: g++ -E failed; see Output.",
    );
    return;
  }
  await vscode.commands.executeCommand(
    "vscode.diff",
    vscode.Uri.file(oursPath),
    vscode.Uri.file(gccPath),
    "CrucibleCpp vs g++ -E",
  );
}

function randomNonce(): string {
  return crypto.randomBytes(16).toString("base64").replace(/[^A-Za-z0-9]/g, "");
}

function analysisPath(document: vscode.TextDocument): string {
  return temporaryOutput(document, "analysis").replace(/\.i$/, ".json");
}

async function commandMacroAnimation(
  document: vscode.TextDocument,
): Promise<void> {
  const analysisFile = analysisPath(document);
  const outcome = await preprocessDocument(document, false, analysisFile);
  if (!outcome || outcome.cancelled) {
    return;
  }
  if (!fs.existsSync(analysisFile)) {
    vscode.window.showErrorMessage(
      "CrucibleCpp: no analysis data was produced. See Output.",
    );
    return;
  }
  const data = parseAnalysis(fs.readFileSync(analysisFile, "utf8"));
  if (!data) {
    vscode.window.showErrorMessage(
      "CrucibleCpp: invalid analysis data. See Output.",
    );
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    "cruciblecpp.macroAnimation",
    "CrucibleCpp: Macro Expansion",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = macroAnimationHtml(data, document.uri.fsPath, randomNonce());
}

async function commandIncludeGraph(
  document: vscode.TextDocument,
): Promise<void> {
  const analysisFile = analysisPath(document);
  const outcome = await preprocessDocument(document, false, analysisFile);
  if (!outcome || outcome.cancelled) {
    return;
  }
  if (!fs.existsSync(analysisFile)) {
    vscode.window.showErrorMessage(
      "CrucibleCpp: no analysis data was produced. See Output.",
    );
    return;
  }
  const data = parseAnalysis(fs.readFileSync(analysisFile, "utf8"));
  if (!data) {
    vscode.window.showErrorMessage(
      "CrucibleCpp: invalid analysis data. See Output.",
    );
    return;
  }
  const root = workspaceRoot(document);
  const panel = vscode.window.createWebviewPanel(
    "cruciblecpp.includeGraph",
    "CrucibleCpp: Include Graph",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.onDidReceiveMessage((message: unknown) => {
    if (
      message &&
      typeof message === "object" &&
      (message as { type?: string }).type === "open"
    ) {
      const file = (message as { path?: string }).path;
      if (!file) {
        return;
      }
      const target = path.isAbsolute(file) ? file : path.resolve(root, file);
      if (!fs.existsSync(target)) {
        vscode.window.showWarningMessage(
          `CrucibleCpp: included file no longer exists: ${target}`,
        );
        return;
      }
      void vscode.window.showTextDocument(vscode.Uri.file(target), {
        preview: true,
      });
    }
  });
  panel.webview.html = includeGraphHtml(data, randomNonce());
}

async function commandShowGccInfo(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const root = folder ?? process.cwd();
  const executable = resolveTool("preprocessor", root);
  if (!executable) {
    return;
  }
  outputChannel.show(true);
  outputChannel.appendLine("=== CrucibleCpp ===");
  const includes = await runProcess(executable, ["--print-gcc-includes"], root);
  outputChannel.appendLine(includes.stdout.trim() || includes.stderr.trim());
  const gcc = resolveGcc(configuration().get<string>("gccPath", ""), root);
  if (gcc) {
    const version = await runProcess(gcc, ["--version"], root);
    outputChannel.appendLine(`=== g++ (${gcc}) ===`);
    outputChannel.appendLine(version.stdout.split(/\r?\n/)[0] ?? "");
  }
}

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("CrucibleCpp");
  diagnosticCollection =
    vscode.languages.createDiagnosticCollection("cruciblecpp");
  previewProvider = new PreviewProvider();
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.text = "CrucibleCpp";
  statusBar.tooltip = "Show CrucibleCpp GCC information";
  statusBar.command = "cruciblecpp.showGccInfo";
  statusBar.show();

  context.subscriptions.push(
    outputChannel,
    diagnosticCollection,
    statusBar,
    vscode.workspace.registerTextDocumentContentProvider(
      PREVIEW_SCHEME,
      previewProvider,
    ),
    vscode.commands.registerCommand(
      "cruciblecpp.preprocess",
      (uri?: vscode.Uri) => {
        const document = uri
          ? vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
          : vscode.window.activeTextEditor?.document;
        if (document) {
          return commandPreprocess(document);
        }
        return undefined;
      },
    ),
    vscode.commands.registerCommand(
      "cruciblecpp.preview",
      (uri?: vscode.Uri) => {
        const document = uri
          ? vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
          : vscode.window.activeTextEditor?.document;
        if (document) {
          return commandPreview(document);
        }
        return undefined;
      },
    ),
    vscode.commands.registerCommand(
      "cruciblecpp.savePreprocessed",
      (uri?: vscode.Uri) => {
        const document = uri
          ? vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
          : vscode.window.activeTextEditor?.document;
        if (document) {
          return commandSave(document);
        }
        return undefined;
      },
    ),
    vscode.commands.registerCommand(
      "cruciblecpp.compareWithGcc",
      (uri?: vscode.Uri) => {
        const document = uri
          ? vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
          : vscode.window.activeTextEditor?.document;
        if (document) {
          return commandCompare(document);
        }
        return undefined;
      },
    ),
    vscode.commands.registerCommand(
      "cruciblecpp.showMacroAnimation",
      (uri?: vscode.Uri) => {
        const document = uri
          ? vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
          : vscode.window.activeTextEditor?.document;
        if (document) {
          return commandMacroAnimation(document);
        }
        return undefined;
      },
    ),
    vscode.commands.registerCommand(
      "cruciblecpp.showIncludeGraph",
      (uri?: vscode.Uri) => {
        const document = uri
          ? vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
          : vscode.window.activeTextEditor?.document;
        if (document) {
          return commandIncludeGraph(document);
        }
        return undefined;
      },
    ),
    vscode.commands.registerCommand("cruciblecpp.showGccInfo", commandShowGccInfo),
    vscode.commands.registerCommand("cruciblecpp.showOutput", () =>
      outputChannel.show(true),
    ),
  );
}

export function deactivate(): void {
  diagnosticCollection?.dispose();
}
