# CrucibleCpp for VS Code

A thin VS Code front-end for `cruciblecpp-preprocessor.exe`.

The preprocessor is maintained at
[`tomatoOyster/cruciblecpp-preprocessor`](https://github.com/tomatoOyster/cruciblecpp-preprocessor).

## Features

- Preprocess the current C/C++ file with CrucibleCpp.
- Show the `.i` result in a read-only preview beside the source.
- Map CrucibleCpp diagnostics to the Problems panel.
- Save the preprocessed file.
- Compare CrucibleCpp output with `g++ -E` using VS Code's diff editor.
- Read include paths and defines from `compile_commands.json`.
- Show the GCC path and include directories discovered by CrucibleCpp.
- Debug macro expansion in a webview:
  - source highlight and Reveal
  - call tree with parent/child events
  - Step Into / Step Over / Step Out
  - raw and expanded arguments
  - `#` / `##` steps
  - token-level diff
  - hotspots, playback speed, loop, search
  - open the generated `.i`
- Explore an interactive include graph: wheel zoom, background pan, draggable nodes, click to open a file.

## Requirements

- Windows x64
- A built `cruciblecpp-preprocessor.exe`
- MinGW-w64 UCRT64 GCC 15.2 installed and available on `PATH`
- VS Code 1.85 or newer

## Build the extension

```powershell
cd C:\Users\1\Desktop\cpp\预处理\cruciblecpp-vscode
npm install
npm run build
```

To run it during development, open this folder in VS Code and press `F5`. The Extension Development Host opens with the extension loaded.

To create a `.vsix`:

```powershell
npm run package
```

## Configure the executable

By default the extension searches:

1. `cruciblecpp.executable`
2. `<workspace>/build/cruciblecpp-preprocessor.exe`
3. `<workspace>/bin/cruciblecpp-preprocessor.exe`
4. `<workspace>/cruciblecpp-preprocessor.exe`
5. `PATH`

If none is found, set `cruciblecpp.executable` in Settings.

For GCC comparison and GCC info, set `cruciblecpp.gccPath` if `g++.exe` is not on `PATH`.

## Commands

- `CrucibleCpp: Preprocess Current File`
- `CrucibleCpp: Preprocess and Preview to Side`
- `CrucibleCpp: Save Preprocessed File`
- `CrucibleCpp: Compare with g++ -E`
- `CrucibleCpp: Macro Expansion Animation`
- `CrucibleCpp: Include Graph`
- `CrucibleCpp: Show GCC Info`
- `CrucibleCpp: Show Output`

The macro animation and include graph require a preprocessor build with
`--analysis-json` support (the local development build includes it; the
`v2.1.0` release does not).

## `compile_commands.json`

Enable `cruciblecpp.useCompileCommands` (default: true) and either:

- place `compile_commands.json` in the workspace root or a common CMake build directory, or
- set `cruciblecpp.compileCommandsPath`.

The extension picks the entry for the current file and extracts:

- `-I`
- `-isystem`
- `-D`
- `-U`
- `-std=`
- `-include`
- charset / `-funsigned-char` flags

`cruciblecpp.standard` defaults to `default`, which follows the `-std=` from
`compile_commands.json` and falls back to `c++20`.

## Limitations

- The extension is Windows-only, matching the preprocessor.
- It preprocesses saved files; unsaved documents are saved first by default.
- The preview is read-only.
- `-fexec-charset` currently affects `#if` character constants only in CrucibleCpp; string literals are not transcoded yet.
- The extension calls the CLI as a child process; it does not link the C++ core.

## License

MIT, matching the parent CrucibleCpp project.
