import { AnalysisData } from "../core/analysis";

function escapeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
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
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 18px;
    color: var(--vscode-foreground, #ddd);
    background: var(--vscode-editor-background, #1e1e1e);
    font-family: var(--vscode-font-family, sans-serif);
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .subtle { color: var(--vscode-descriptionForeground, #aaa); font-size: 12px; }
  .toolbar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: 14px 0; font-size: 12px; }
  .toolbar label { display: inline-flex; gap: 6px; align-items: center; }
  input[type=range] { width: 180px; accent-color: var(--vscode-button-background, #0e639c); }
  button {
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
    border: 0;
    border-radius: 4px;
    padding: 5px 10px;
    cursor: pointer;
    font: inherit;
  }
  .wrap {
    max-height: calc(100vh - 190px);
    overflow: auto;
    border: 1px solid var(--vscode-panel-border, #555);
    border-radius: 8px;
    background: var(--vscode-editor-background, #1e1e1e);
  }
  svg { display: block; }
  text { font-family: var(--vscode-font-family, sans-serif); font-size: 12px; fill: var(--vscode-foreground, #ddd); }
  .edge { stroke: var(--vscode-editorLineNumber-foreground, #999); stroke-width: 1.2; opacity: .8; }
  .edge:hover { stroke: var(--vscode-focusBorder, #007fd4); opacity: 1; }
  .node rect { fill: var(--vscode-sideBar-background, #252526); stroke: var(--vscode-panel-border, #555); }
  .node.system rect { fill: var(--vscode-textCodeBlock-background, #2d2d2d); opacity: .88; }
  .node.project rect { stroke: var(--vscode-focusBorder, #007fd4); }
  .node:hover rect { stroke: var(--vscode-focusBorder, #007fd4); stroke-width: 2; }
  .stats { color: var(--vscode-descriptionForeground, #aaa); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
  <h1>Include graph</h1>
  <div class="subtle">Click a node to open it. Wheel over the graph to zoom; drag the scrollbars to pan.</div>
  <div class="toolbar">
    <label>Depth <input id="depth" type="range" min="0" value="2"><span id="depthLabel">2</span></label>
    <button id="all">Show all</button>
    <button id="fit">Fit</button>
    <button id="zoomOut">-</button>
    <span id="zoomLabel">100%</span>
    <button id="zoomIn">+</button>
    <label><input id="system" type="checkbox" checked> System headers</label>
    <span class="stats" id="stats"></span>
  </div>
  <div class="wrap" id="wrap"></div>
  <script nonce="${nonce}">
    const data = ${payload};
    const vscode = acquireVsCodeApi();
    const svgNs = 'http://www.w3.org/2000/svg';
    const slashPath = (file) => file.split(String.fromCharCode(92)).join('/');
    const normalizePath = (file) => slashPath(file).toLowerCase();
    const isSystem = (file) => {
      const normalized = normalizePath(file);
      return normalized.includes('/include/c++/') ||
        normalized.includes('/lib/gcc/') ||
        normalized.includes('/ucrt64/include/') ||
        normalized.includes('/mingw64/include/');
    };

    const children = new Map();
    const allFiles = new Set(data.files);
    for (const edge of data.includes) {
      allFiles.add(edge.from);
      allFiles.add(edge.to);
      if (!children.has(edge.from)) children.set(edge.from, []);
      children.get(edge.from).push(edge.to);
    }
    const root = allFiles.has(data.root) ? data.root : (data.files[0] || data.root);
    const depths = new Map([[root, 0]]);
    const queue = [root];
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
    const maxDepth = Math.max(0, ...depths.values());
    const depthInput = document.getElementById('depth');
    const depthLabel = document.getElementById('depthLabel');
    const systemInput = document.getElementById('system');
    const stats = document.getElementById('stats');
    const wrap = document.getElementById('wrap');
    const zoomLabel = document.getElementById('zoomLabel');
    let graphWidth = 1;
    let graphHeight = 1;
    let zoom = 1;
    depthInput.max = String(maxDepth);
    depthInput.value = String(Math.min(2, maxDepth));
    depthLabel.textContent = depthInput.value;

    const svg = document.createElementNS(svgNs, 'svg');
    const defs = document.createElementNS(svgNs, 'defs');
    defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"></path></marker>';
    svg.appendChild(defs);
    const edgeLayer = document.createElementNS(svgNs, 'g');
    const nodeLayer = document.createElementNS(svgNs, 'g');
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    wrap.appendChild(svg);

    wrap.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const graphX = (wrap.scrollLeft + mouseX) / zoom;
      const graphY = (wrap.scrollTop + mouseY) / zoom;
      const factor = Math.max(0.75, Math.min(1.25, Math.exp(-event.deltaY * 0.0018)));
      const next = Math.max(0.1, Math.min(3, zoom * factor));
      if (next === zoom) {
        return;
      }
      zoom = next;
      applyZoom();
      wrap.scrollLeft = graphX * zoom - mouseX;
      wrap.scrollTop = graphY * zoom - mouseY;
    }, { passive: false });

    function applyZoom() {
      const width = Math.round(graphWidth * zoom);
      const height = Math.round(graphHeight * zoom);
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.style.width = width + 'px';
      svg.style.height = height + 'px';
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
    }

    function fitToWidth() {
      const available = Math.max(240, wrap.clientWidth - 4);
      zoom = Math.min(1, available / graphWidth);
      applyZoom();
    }

    function draw(limit, showSystem) {
      edgeLayer.replaceChildren();
      nodeLayer.replaceChildren();
      const visible = new Map();
      for (const [file, depth] of depths) {
        if (depth <= limit && (showSystem || !isSystem(file))) {
          visible.set(file, depth);
        }
      }
      const byDepth = new Map();
      for (const [file, depth] of visible) {
        if (!byDepth.has(depth)) byDepth.set(depth, []);
        byDepth.get(depth).push(file);
      }
      const rows = Math.max(1, ...[...byDepth.values()].map((files) => files.length));
      const xGap = 260;
      const yGap = 48;
      const margin = 30;
      const width = margin * 2 + limit * xGap + 230;
      const height = margin * 2 + rows * yGap;
      const positions = new Map();
      for (const [depth, files] of byDepth) {
        files.sort();
        files.forEach((file, row) => {
          positions.set(file, { x: margin + depth * xGap, y: margin + row * yGap });
        });
      }

      let visibleEdges = 0;
      for (const edge of data.includes) {
        if (!positions.has(edge.from) || !positions.has(edge.to)) continue;
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        const line = document.createElementNS(svgNs, 'line');
        line.setAttribute('x1', String(from.x + 210));
        line.setAttribute('y1', String(from.y + 16));
        line.setAttribute('x2', String(to.x));
        line.setAttribute('y2', String(to.y + 16));
        line.setAttribute('class', 'edge');
        line.setAttribute('marker-end', 'url(#arrow)');
        edgeLayer.appendChild(line);
        visibleEdges += 1;
      }

      for (const [file, position] of positions) {
        const group = document.createElementNS(svgNs, 'g');
        group.setAttribute('class', 'node ' + (isSystem(file) ? 'system' : 'project'));
        group.setAttribute('transform', 'translate(' + position.x + ',' + position.y + ')');
        group.style.cursor = 'pointer';
        group.addEventListener('click', () => vscode.postMessage({ type: 'open', path: file }));
        const rect = document.createElementNS(svgNs, 'rect');
        rect.setAttribute('width', '210');
        rect.setAttribute('height', '32');
        rect.setAttribute('rx', '5');
        group.appendChild(rect);
        const title = document.createElementNS(svgNs, 'title');
        title.textContent = file;
        group.appendChild(title);
        const label = document.createElementNS(svgNs, 'text');
        label.setAttribute('x', '8');
        label.setAttribute('y', '20');
        label.textContent = slashPath(file).split('/').pop();
        group.appendChild(label);
        nodeLayer.appendChild(group);
      }

      graphWidth = width;
      graphHeight = height;
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      applyZoom();
      stats.textContent = 'Showing ' + positions.size + ' / ' + allFiles.size +
        ' files · ' + visibleEdges + ' / ' + data.includes.length + ' edges';
      depthLabel.textContent = String(limit);
    }

    depthInput.addEventListener('input', () => {
      draw(Number(depthInput.value), systemInput.checked);
    });
    systemInput.addEventListener('change', () => {
      draw(Number(depthInput.value), systemInput.checked);
    });
    document.getElementById('all').addEventListener('click', () => {
      depthInput.value = String(maxDepth);
      draw(maxDepth, systemInput.checked);
      fitToWidth();
    });
    document.getElementById('fit').addEventListener('click', fitToWidth);
    document.getElementById('zoomIn').addEventListener('click', () => {
      zoom = Math.min(2, zoom + 0.1);
      applyZoom();
    });
    document.getElementById('zoomOut').addEventListener('click', () => {
      zoom = Math.max(0.1, zoom - 0.1);
      applyZoom();
    });
    draw(Number(depthInput.value), systemInput.checked);
  </script>
</body>
</html>`;
}
