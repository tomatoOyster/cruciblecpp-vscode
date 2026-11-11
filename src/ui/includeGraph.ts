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
  html, body { height: 100%; }
  body {
    margin: 0;
    padding: 18px;
    color: var(--vscode-foreground, #ddd);
    background: var(--vscode-editor-background, #1e1e1e);
    font-family: var(--vscode-font-family, sans-serif);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .subtle { color: var(--vscode-descriptionForeground, #aaa); font-size: 12px; }
  .toolbar { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin: 12px 0; font-size: 12px; }
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
  #zoomLabel { min-width: 42px; text-align: center; font-variant-numeric: tabular-nums; }
  .wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--vscode-panel-border, #555);
    border-radius: 8px;
    background: var(--vscode-editor-background, #1e1e1e);
    cursor: grab;
    touch-action: none;
  }
  .wrap.dragging { cursor: grabbing; }
  svg { display: block; width: 100%; height: 100%; user-select: none; }
  text { font-family: var(--vscode-font-family, sans-serif); font-size: 12px; fill: var(--vscode-foreground, #ddd); pointer-events: none; }
  .edge { stroke: var(--vscode-editorLineNumber-foreground, #999); stroke-width: 1.2; opacity: .8; pointer-events: none; }
  .node rect { fill: var(--vscode-sideBar-background, #252526); stroke: var(--vscode-panel-border, #555); }
  .node.system rect { fill: var(--vscode-textCodeBlock-background, #2d2d2d); opacity: .88; }
  .node.project rect { stroke: var(--vscode-focusBorder, #007fd4); }
  .node { cursor: grab; }
  .node.dragging { cursor: grabbing; }
  .node:hover rect { stroke: var(--vscode-focusBorder, #007fd4); stroke-width: 2; }
  .stats { color: var(--vscode-descriptionForeground, #aaa); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
  <h1>Include graph</h1>
  <div class="subtle">Drag background to pan · drag a node to move it · wheel to zoom · click a node to open it</div>
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
    const NODE_W = 210;
    const NODE_H = 32;
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

    const wrap = document.getElementById('wrap');
    const depthInput = document.getElementById('depth');
    const depthLabel = document.getElementById('depthLabel');
    const systemInput = document.getElementById('system');
    const stats = document.getElementById('stats');
    const zoomLabel = document.getElementById('zoomLabel');
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

    let scale = 1;
    let panX = 0;
    let panY = 0;
    let viewportW = 1;
    let viewportH = 1;
    let visibleFiles = [];
    let positions = new Map();

    function layout(limit, showSystem) {
      const visible = [];
      for (const [file, depth] of depths) {
        if (depth <= limit && (showSystem || !isSystem(file))) {
          visible.push([file, depth]);
        }
      }
      const byDepth = new Map();
      for (const [file, depth] of visible) {
        if (!byDepth.has(depth)) byDepth.set(depth, []);
        byDepth.get(depth).push(file);
      }
      positions = new Map();
      visibleFiles = [];
      for (const [depth, files] of byDepth) {
        files.sort();
        files.forEach((file, row) => {
          positions.set(file, {
            x: 40 + depth * 260,
            y: 40 + row * 48,
          });
          visibleFiles.push(file);
        });
      }
      return byDepth;
    }

    function render() {
      edgeLayer.replaceChildren();
      nodeLayer.replaceChildren();
      let edges = 0;
      for (const edge of data.includes) {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        if (!from || !to) {
          continue;
        }
        const line = document.createElementNS(svgNs, 'line');
        line.setAttribute('x1', String(from.x * scale + panX + NODE_W));
        line.setAttribute('y1', String(from.y * scale + panY + NODE_H / 2));
        line.setAttribute('x2', String(to.x * scale + panX));
        line.setAttribute('y2', String(to.y * scale + panY + NODE_H / 2));
        line.setAttribute('class', 'edge');
        line.setAttribute('marker-end', 'url(#arrow)');
        edgeLayer.appendChild(line);
        edges += 1;
      }

      for (const file of visibleFiles) {
        const position = positions.get(file);
        const group = document.createElementNS(svgNs, 'g');
        group.setAttribute('class', 'node ' + (isSystem(file) ? 'system' : 'project'));
        group.setAttribute('transform', 'translate(' + (position.x * scale + panX) + ',' + (position.y * scale + panY) + ')');
        group.dataset.file = file;
        const rect = document.createElementNS(svgNs, 'rect');
        rect.setAttribute('width', String(NODE_W));
        rect.setAttribute('height', String(NODE_H));
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

      stats.textContent = 'Showing ' + visibleFiles.length + ' / ' + allFiles.size +
        ' files · ' + edges + ' / ' + data.includes.length + ' edges';
      depthLabel.textContent = String(Number(depthInput.value));
      zoomLabel.textContent = Math.round(scale * 100) + '%';
    }

    function fit() {
      const entries = [...positions.values()];
      if (!entries.length) {
        scale = 1;
        panX = 0;
        panY = 0;
        render();
        return;
      }
      const minX = Math.min(...entries.map((position) => position.x));
      const minY = Math.min(...entries.map((position) => position.y));
      const maxX = Math.max(...entries.map((position) => position.x + NODE_W));
      const maxY = Math.max(...entries.map((position) => position.y + NODE_H));
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      scale = Math.max(0.25, Math.min(1, (viewportW - 40) / width, (viewportH - 40) / height));
      panX = (viewportW - width * scale) / 2 - minX * scale;
      panY = (viewportH - height * scale) / 2 - minY * scale;
      render();
    }

    function resize() {
      viewportW = Math.max(1, wrap.clientWidth);
      viewportH = Math.max(1, wrap.clientHeight);
      svg.setAttribute('width', String(viewportW));
      svg.setAttribute('height', String(viewportH));
      svg.setAttribute('viewBox', '0 0 ' + viewportW + ' ' + viewportH);
      render();
    }

    function draw(limit, showSystem, doFit) {
      layout(limit, showSystem);
      if (doFit) {
        fit();
      } else {
        render();
      }
    }

    function zoomAt(factor, screenX, screenY) {
      const worldX = (screenX - panX) / scale;
      const worldY = (screenY - panY) / scale;
      scale = Math.max(0.25, Math.min(3, scale * factor));
      panX = screenX - worldX * scale;
      panY = screenY - worldY * scale;
      render();
    }

    wrap.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const factor = Math.max(0.8, Math.min(1.2, Math.exp(-event.deltaY * 0.0015)));
      zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    wrap.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.node')) {
        return;
      }
      panning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      panOriginX = panX;
      panOriginY = panY;
      wrap.classList.add('dragging');
      wrap.setPointerCapture(event.pointerId);
    });
    wrap.addEventListener('pointermove', (event) => {
      if (!panning) {
        return;
      }
      panX = panOriginX + event.clientX - panStartX;
      panY = panOriginY + event.clientY - panStartY;
      render();
    });
    const endPan = () => {
      panning = false;
      wrap.classList.remove('dragging');
    };
    wrap.addEventListener('pointerup', endPan);
    wrap.addEventListener('pointercancel', endPan);

    nodeLayer.addEventListener('pointerdown', (event) => {
      const target = event.target instanceof Element ? event.target.closest('.node') : null;
      if (!target) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const file = target.dataset.file;
      const start = positions.get(file);
      if (!start) {
        return;
      }
      const startX = event.clientX;
      const startY = event.clientY;
      const origin = { x: start.x, y: start.y };
      let moved = false;
      target.classList.add('dragging');
      const onMove = (moveEvent) => {
        const dx = (moveEvent.clientX - startX) / scale;
        const dy = (moveEvent.clientY - startY) / scale;
        if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) > 2) {
          moved = true;
        }
        positions.set(file, { x: origin.x + dx, y: origin.y + dy });
        render();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (!moved) {
          vscode.postMessage({ type: 'open', path: file });
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    depthInput.addEventListener('input', () => {
      draw(Number(depthInput.value), systemInput.checked, true);
    });
    systemInput.addEventListener('change', () => {
      draw(Number(depthInput.value), systemInput.checked, true);
    });
    document.getElementById('all').addEventListener('click', () => {
      depthInput.value = String(maxDepth);
      draw(maxDepth, systemInput.checked, true);
    });
    document.getElementById('fit').addEventListener('click', fit);
    document.getElementById('zoomIn').addEventListener('click', () => {
      zoomAt(1.15, viewportW / 2, viewportH / 2);
    });
    document.getElementById('zoomOut').addEventListener('click', () => {
      zoomAt(1 / 1.15, viewportW / 2, viewportH / 2);
    });

    new ResizeObserver(resize).observe(wrap);
    resize();
    draw(Number(depthInput.value), systemInput.checked, true);
  </script>
</body>
</html>`;
}
