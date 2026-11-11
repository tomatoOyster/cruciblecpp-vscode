import * as path from "node:path";

import { AnalysisData, macroEventsForSource } from "../core/analysis";

function escapeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function baseStyle(): string {
  return `
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 18px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
    }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .subtle { color: var(--vscode-descriptionForeground); font-size: 12px; }
    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 0;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: .5; cursor: default; }
    input[type=range] { width: 240px; accent-color: var(--vscode-button-background); }
  `;
}

export function macroAnimationHtml(
  data: AnalysisData,
  sourceFile: string,
  nonce: string,
): string {
  const events = macroEventsForSource(data, sourceFile);
  const payload = escapeForScript(events);
  const sourceName = path.basename(sourceFile);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${baseStyle()}
  .stage { margin: 20px 0; border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 18px; min-height: 180px; }
  .macro { font-size: 30px; font-weight: 700; color: var(--vscode-symbolIcon-functionForeground); transition: opacity .15s; }
  .macro.pulse { opacity: .2; }
  .loc { margin-top: 6px; color: var(--vscode-descriptionForeground); font-size: 12px; }
  .replacement { margin-top: 16px; padding: 14px; border-radius: 6px; background: var(--vscode-textCodeBlock-background); white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family); font-size: 14px; min-height: 52px; }
  .controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .counter { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
  <h1>Macro expansion</h1>
  <div class="subtle">${sourceName} &middot; ${events.length} expansion event(s)</div>
  <div class="stage">
    <div class="macro" id="macro">&mdash;</div>
    <div class="loc" id="loc">Press Play to walk through the macro expansion trace.</div>
    <div class="replacement" id="replacement"></div>
  </div>
  <div class="controls">
    <button id="play">Play</button>
    <button id="prev">Prev</button>
    <button id="next">Next</button>
    <input id="slider" type="range" min="0" max="${Math.max(0, events.length - 1)}" value="0">
    <span class="counter" id="counter">0 / ${events.length}</span>
  </div>
  <script nonce="${nonce}">
    const events = ${payload};
    const macro = document.getElementById('macro');
    const loc = document.getElementById('loc');
    const replacement = document.getElementById('replacement');
    const slider = document.getElementById('slider');
    const counter = document.getElementById('counter');
    const play = document.getElementById('play');
    let index = 0;
    let timer = undefined;

    function render(next) {
      if (!events.length) {
        macro.textContent = 'No macro expansion events';
        loc.textContent = 'The selected file did not expand any macros.';
        counter.textContent = '0 / 0';
        return;
      }
      index = Math.max(0, Math.min(events.length - 1, next));
      const event = events[index];
      macro.classList.add('pulse');
      macro.textContent = event.macro;
      loc.textContent = event.file + ':' + event.line + ':' + event.column + '  depth ' + event.depth;
      replacement.textContent = event.replacement || '(empty replacement)';
      slider.value = String(index);
      counter.textContent = (index + 1) + ' / ' + events.length;
      setTimeout(() => macro.classList.remove('pulse'), 130);
    }

    function stop() {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      play.textContent = 'Play';
    }

    play.addEventListener('click', () => {
      if (timer !== undefined) {
        stop();
        return;
      }
      if (index >= events.length - 1) {
        render(0);
      }
      play.textContent = 'Pause';
      timer = setInterval(() => {
        if (index >= events.length - 1) {
          stop();
          return;
        }
        render(index + 1);
      }, 900);
    });
    document.getElementById('prev').addEventListener('click', () => { stop(); render(index - 1); });
    document.getElementById('next').addEventListener('click', () => { stop(); render(index + 1); });
    slider.addEventListener('input', () => { stop(); render(Number(slider.value)); });
    render(0);
  </script>
</body>
</html>`;
}

export function includeGraphHtml(data: AnalysisData, nonce: string): string {
  const payload = escapeForScript({
    root: data.root,
    files: data.files,
    includes: data.includes,
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${baseStyle()}
  .wrap { margin-top: 14px; overflow: auto; border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-editor-background); }
  svg { display: block; min-width: 100%; }
  text { font-family: var(--vscode-font-family); font-size: 12px; fill: var(--vscode-foreground); }
  .edge { stroke: var(--vscode-editorLineNumber-foreground); stroke-width: 1.2; opacity: .65; }
  .node rect { fill: var(--vscode-sideBar-background); stroke: var(--vscode-panel-border); rx: 5; }
  .node.system rect { fill: var(--vscode-textCodeBlock-background); opacity: .8; }
  .node.project rect { stroke: var(--vscode-focusBorder); }
  .node:hover rect { stroke: var(--vscode-focusBorder); stroke-width: 2; }
</style>
</head>
<body>
  <h1>Include graph</h1>
  <div class="subtle">${data.files.length} files &middot; ${data.includes.length} include edge(s) &middot; click a node to open it</div>
  <div class="wrap" id="wrap"></div>
  <script nonce="${nonce}">
    const data = ${payload};
    const vscode = acquireVsCodeApi();
    const svgNs = 'http://www.w3.org/2000/svg';
    const byFile = new Map();
    const depths = new Map();
    const children = new Map();
    const slashPath = (file) => file.split(String.fromCharCode(92)).join('/');
    const normalizePath = (file) => slashPath(file).toLowerCase();
    const system = (file) => {
      const normalized = normalizePath(file);
      return normalized.includes('/include/c++/') ||
        normalized.includes('/lib/gcc/') ||
        normalized.includes('/ucrt64/include/') ||
        normalized.includes('/mingw64/include/');
    };

    for (const file of data.files) {
      byFile.set(file, { file, depth: 0 });
      children.set(file, []);
    }
    for (const edge of data.includes) {
      if (!children.has(edge.from)) children.set(edge.from, []);
      children.get(edge.from).push(edge.to);
      if (!byFile.has(edge.to)) byFile.set(edge.to, { file: edge.to, depth: 0 });
      if (!byFile.has(edge.from)) byFile.set(edge.from, { file: edge.from, depth: 0 });
    }

    const root = byFile.has(data.root) ? data.root : (data.files[0] || data.root);
    const queue = [root];
    depths.set(root, 0);
    while (queue.length) {
      const current = queue.shift();
      const depth = depths.get(current) || 0;
      for (const child of children.get(current) || []) {
        if (!depths.has(child)) {
          depths.set(child, depth + 1);
          queue.push(child);
        }
      }
    }

    const byDepth = new Map();
    for (const [file, depth] of depths) {
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth).push(file);
    }
    const maxDepth = Math.max(0, ...depths.values());
    const maxRows = Math.max(1, ...[...byDepth.values()].map((v) => v.length));
    const xGap = 260;
    const yGap = 48;
    const margin = 30;
    const width = margin * 2 + maxDepth * xGap + 230;
    const height = margin * 2 + maxRows * yGap;

    const positions = new Map();
    for (const [depth, files] of byDepth) {
      files.sort();
      files.forEach((file, row) => {
        positions.set(file, { x: margin + depth * xGap, y: margin + row * yGap });
      });
    }

    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    const edgeLayer = document.createElementNS(svgNs, 'g');
    const nodeLayer = document.createElementNS(svgNs, 'g');
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

    for (const edge of data.includes) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) continue;
      const line = document.createElementNS(svgNs, 'line');
      line.setAttribute('x1', String(from.x + 210));
      line.setAttribute('y1', String(from.y + 16));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y + 16));
      line.setAttribute('class', 'edge');
      edgeLayer.appendChild(line);
    }

    for (const [file, position] of positions) {
      const group = document.createElementNS(svgNs, 'g');
      group.setAttribute('class', 'node ' + (system(file) ? 'system' : 'project'));
      group.setAttribute('transform', 'translate(' + position.x + ',' + position.y + ')');
      group.style.cursor = 'pointer';
      group.addEventListener('click', () => vscode.postMessage({ type: 'open', path: file }));
      const rect = document.createElementNS(svgNs, 'rect');
      rect.setAttribute('width', '210');
      rect.setAttribute('height', '32');
      rect.setAttribute('rx', '5');
      group.appendChild(rect);
      const label = document.createElementNS(svgNs, 'text');
      label.setAttribute('x', '8');
      label.setAttribute('y', '20');
      label.textContent = slashPath(file).split('/').pop();
      const title = document.createElementNS(svgNs, 'title');
      title.textContent = file;
      group.appendChild(title);
      group.appendChild(label);
      nodeLayer.appendChild(group);
    }

    document.getElementById('wrap').appendChild(svg);
  </script>
</body>
</html>`;
}
