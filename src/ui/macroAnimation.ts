import * as path from "node:path";

import { AnalysisData, macroEventsForSource } from "../core/analysis";

function escapeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function macroAnimationHtml(
  data: AnalysisData,
  sourceFile: string,
  nonce: string,
  outputPath?: string,
): string {
  const events = macroEventsForSource(data, sourceFile).map((event, index) => ({
    ...event,
    id: event.id ?? index + 1,
    parentId: event.parentId ?? -1,
  }));
  const sourceName = path.basename(sourceFile);
  const payload = escapeForScript({ events, outputPath: outputPath ?? "" });
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
    padding: 14px;
    color: var(--vscode-foreground, #ddd);
    background: var(--vscode-editor-background, #1e1e1e);
    font-family: var(--vscode-font-family, sans-serif);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  h1 { font-size: 17px; margin: 0; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--vscode-descriptionForeground, #aaa); margin: 0 0 8px; }
  h3 { font-size: 12px; margin: 0 0 6px; color: var(--vscode-descriptionForeground, #aaa); }
  .subtle { color: var(--vscode-descriptionForeground, #aaa); font-size: 12px; }
  .header { display: flex; gap: 18px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
  .controls { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
  button, select {
    color: var(--vscode-button-foreground, #fff);
    background: var(--vscode-button-background, #0e639c);
    border: 0;
    border-radius: 4px;
    padding: 4px 9px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button.secondary, select {
    color: var(--vscode-button-secondaryForeground, #ddd);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
  }
  button:hover { filter: brightness(1.12); }
  .main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 230px minmax(360px, 1fr) 220px;
    gap: 10px;
    margin-top: 10px;
  }
  .panel {
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--vscode-panel-border, #555);
    border-radius: 7px;
    padding: 10px;
    background: var(--vscode-sideBar-background, #202020);
  }
  .stage { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow: auto; }
  .box {
    border: 1px solid var(--vscode-panel-border, #555);
    border-radius: 7px;
    padding: 10px;
    background: var(--vscode-editor-background, #1e1e1e);
  }
  .source-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .source {
    margin: 0;
    padding: 8px;
    border-radius: 5px;
    background: var(--vscode-textCodeBlock-background, #2d2d2d);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .highlight { background: var(--vscode-editor-findMatchHighlightBackground, #613214); border-radius: 2px; }
  .macro-name { font-size: 27px; font-weight: 700; color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); }
  .loc { color: var(--vscode-descriptionForeground, #aaa); font-size: 12px; margin-top: 3px; }
  .replacement {
    margin-top: 8px;
    padding: 9px;
    border-radius: 5px;
    background: var(--vscode-textCodeBlock-background, #2d2d2d);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 14px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .removed { color: var(--vscode-errorForeground, #f48771); text-decoration: line-through; opacity: .8; }
  .added { color: var(--vscode-terminal-ansiGreen, #89d185); background: rgba(80, 160, 80, .12); border-radius: 2px; }
  .same { color: var(--vscode-descriptionForeground, #bbb); }
  .diff-row { margin: 5px 0; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .tree-node { padding: 2px 0 2px 10px; border-left: 1px solid var(--vscode-panel-border, #555); margin-left: 5px; }
  .tree-item {
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tree-item:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .tree-item.active { background: var(--vscode-list-activeSelectionBackground, #094771); color: var(--vscode-list-activeSelectionForeground, #fff); }
  .badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 8px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    font-size: 10px;
    margin-left: 5px;
  }
  .arg { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border, #444); font-size: 12px; }
  .arg code, .step code { font-family: var(--vscode-editor-font-family, monospace); }
  .step { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border, #444); font-size: 12px; }
  .op { color: var(--vscode-symbolIcon-keywordForeground, #c586c0); font-weight: 600; }
  .hot { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; gap: 8px; }
  .hot span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .footer { display: flex; gap: 8px; align-items: center; margin-top: 9px; flex-wrap: wrap; }
  #search {
    color: var(--vscode-input-foreground, #ddd);
    background: var(--vscode-input-background, #2d2d2d);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 4px;
    padding: 4px 8px;
    font: inherit;
    font-size: 12px;
    width: 150px;
  }
  input[type=range] { flex: 1; min-width: 120px; accent-color: var(--vscode-button-background, #0e639c); }
  .counter { color: var(--vscode-descriptionForeground, #aaa); font-variant-numeric: tabular-nums; font-size: 12px; }
  @media (max-width: 900px) {
    .main { grid-template-columns: 180px 1fr; }
    .hotspots { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Macro expansion</h1>
      <div class="subtle">${sourceName} · ${events.length} event(s) · source-linked trace</div>
    </div>
    <div class="controls">
      <button id="play">Play</button>
      <button id="prev" class="secondary">Prev</button>
      <button id="stepInto" class="secondary">Step Into</button>
      <button id="stepOver" class="secondary">Step Over</button>
      <button id="stepOut" class="secondary">Step Out</button>
      <button id="next" class="secondary">Next</button>
      <input id="search" placeholder="Find macro..." title="Enter to jump to the next matching macro">
      <select id="speed" title="Playback speed">
        <option value="0.1">0.1x</option>
        <option value="0.2">0.2x</option>
        <option value="0.3">0.3x</option>
        <option value="0.5">0.5x</option>
        <option value="0.75">0.75x</option>
        <option value="1" selected>1x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
        <option value="1.75">1.75x</option>
        <option value="2">2x</option>
        <option value="3">3x</option>
        <option value="4">4x</option>
        <option value="6">6x</option>
        <option value="8">8x</option>
      </select>
      <label class="subtle"><input id="loop" type="checkbox"> Loop</label>
    </div>
  </div>

  <div class="main">
    <aside class="panel">
      <h2>Call tree</h2>
      <div id="tree"></div>
    </aside>

    <section class="stage">
      <div class="box">
        <div class="source-bar">
          <h3 style="margin:0">Source</h3>
          <button id="openSource" class="secondary">Reveal</button>
        </div>
        <pre class="source" id="sourceLine"></pre>
      </div>

      <div class="box">
        <div class="macro-name" id="macroName">—</div>
        <div class="loc" id="loc"></div>
        <div class="replacement" id="replacement"></div>
        <h3 style="margin-top:12px">Token diff</h3>
        <div id="diff"></div>
      </div>

      <div class="box">
        <h3>Definition</h3>
        <div id="definition" class="subtle"></div>
        <h3 style="margin-top:12px">Arguments</h3>
        <div id="arguments"></div>
        <h3 style="margin-top:12px">Steps</h3>
        <div id="steps"></div>
      </div>
    </section>

    <aside class="panel hotspots">
      <h2>Hotspots</h2>
      <div id="hotspots"></div>
      <div style="margin-top:12px">
        <button id="openOutput" class="secondary" style="display:none">Open .i</button>
      </div>
    </aside>
  </div>

  <div class="footer">
    <input id="slider" type="range" min="0" max="${Math.max(0, events.length - 1)}" value="0">
    <span class="counter" id="counter">0 / ${events.length}</span>
  </div>

  <script nonce="${nonce}">
    const data = ${payload};
    const vscode = acquireVsCodeApi();
    const events = data.events;
    if (data.outputPath) {
      document.getElementById('openOutput').style.display = 'inline-block';
    }

    const byId = new Map();
    events.forEach((event, index) => byId.set(event.id, { event, index }));
    const children = new Map();
    for (const event of events) {
      if (!children.has(event.parentId)) children.set(event.parentId, []);
      children.get(event.parentId).push(event);
    }
    const roots = events.filter((event) => !byId.has(event.parentId));
    const currentById = (id) => byId.get(id);
    const currentIndex = () => events.findIndex((event) => event.id === currentId);
    let currentId = events.length ? events[0].id : 0;
    let timer;
    let playing = false;

    const sourceLine = document.getElementById('sourceLine');
    const macroName = document.getElementById('macroName');
    const loc = document.getElementById('loc');
    const replacement = document.getElementById('replacement');
    const diff = document.getElementById('diff');
    const definition = document.getElementById('definition');
    const argumentsBox = document.getElementById('arguments');
    const steps = document.getElementById('steps');
    const slider = document.getElementById('slider');
    const counter = document.getElementById('counter');
    const play = document.getElementById('play');

    function basename(file) {
      return file.split(String.fromCharCode(92)).join('/').split('/').pop();
    }

    function tokenize(text) {
      return text.match(/[A-Za-z_]\\w*|\\d+(?:\\.\\d+)?|[^\\s]/g) || [];
    }

    function tokenDiff(before, after) {
      const a = tokenize(before);
      const b = tokenize(after);
      const n = a.length;
      const m = b.length;
      if (n * m > 40000) {
        return '<div class="diff-row"><span class="removed">' + escapeHtml(before) +
          '</span><br><span class="added">' + escapeHtml(after) + '</span></div>';
      }
      const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      let html = '';
      while (i < n || j < m) {
        if (i < n && j < m && a[i] === b[j]) {
          html += '<span class="same">' + escapeHtml(a[i]) + ' </span>';
          i++;
          j++;
        } else if (j < m && (i >= n || dp[i][j + 1] > dp[i + 1][j])) {
          html += '<span class="added">' + escapeHtml(b[j]) + ' </span>';
          j++;
        } else {
          html += '<span class="removed">' + escapeHtml(a[i]) + ' </span>';
          i++;
        }
      }
      return '<div class="diff-row">' + html + '</div>';
    }

    function escapeHtml(text) {
      return String(text).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[ch]));
    }

    function sourceHtml(event) {
      const line = event.sourceLine || event.invocation || '';
      const column = Math.max(1, event.column || 1);
      const length = Math.max(0, event.length || (event.invocation || '').length);
      const start = Math.min(line.length, column - 1);
      const end = Math.min(line.length, start + length);
      const before = line.slice(0, start);
      const marked = line.slice(start, end);
      const after = line.slice(end);
      return escapeHtml(before) + '<span class="highlight">' + escapeHtml(marked) + '</span>' + escapeHtml(after);
    }

    function renderTree() {
      const tree = document.getElementById('tree');
      tree.replaceChildren();
      const add = (event, depth) => {
        const node = document.createElement('div');
        node.className = 'tree-node';
        const item = document.createElement('div');
        item.className = 'tree-item' + (event.id === currentId ? ' active' : '');
        item.title = event.invocation || event.macro;
        item.textContent = event.macro + '  ' + basename(event.file) + ':' + event.line;
        item.addEventListener('click', () => {
          currentId = event.id;
          render();
        });
        node.appendChild(item);
        tree.appendChild(node);
        for (const child of children.get(event.id) || []) {
          add(child, depth + 1);
        }
      };
      for (const root of roots) add(root, 0);
    }

    function renderHotspots() {
      const counts = new Map();
      for (const event of events) counts.set(event.macro, (counts.get(event.macro) || 0) + 1);
      const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      const target = document.getElementById('hotspots');
      target.replaceChildren();
      for (const [name, count] of rows) {
        const row = document.createElement('div');
        row.className = 'hot';
        row.style.cursor = 'pointer';
        row.innerHTML = '<span>' + escapeHtml(name) + '</span><span>' + count + '</span>';
        row.addEventListener('click', () => {
          document.getElementById('search').value = name;
          jumpToMacro(name, -1);
        });
        target.appendChild(row);
      }
      if (!rows.length) target.textContent = 'No macro events.';
    }

    function subtreeEndIndex(event) {
      const index = byId.get(event.id)?.index ?? 0;
      let end = index;
      const visit = (node) => {
        end = Math.max(end, byId.get(node.id)?.index ?? end);
        for (const child of children.get(node.id) || []) visit(child);
      };
      visit(event);
      return end;
    }

    function render() {
      const entry = byId.get(currentId);
      if (!entry) {
        macroName.textContent = 'No macro expansion events';
        sourceLine.textContent = '';
        return;
      }
      const event = entry.event;
      macroName.textContent = event.macro;
      loc.textContent = basename(event.file) + ':' + event.line + ':' + event.column +
        ' · depth ' + event.depth + (event.kind ? ' · ' + event.kind : '');
      sourceLine.innerHTML = sourceHtml(event);
      replacement.textContent = event.replacement || '(empty replacement)';
      diff.innerHTML = tokenDiff(event.invocation || event.sourceLine || '', event.replacement || '');

      if (event.definitionFile && event.definitionLine) {
        definition.textContent =
          (event.definitionText ? event.definitionText + '\\n' : '') +
          basename(event.definitionFile) + ':' + event.definitionLine + ':' + (event.definitionColumn || 1);
        definition.style.cursor = 'pointer';
        definition.style.whiteSpace = 'pre-wrap';
        definition.onclick = () => vscode.postMessage({
          type: 'reveal',
          file: event.definitionFile,
          line: event.definitionLine,
          column: event.definitionColumn || 1,
          length: 0,
        });
      } else {
        definition.textContent = 'not available';
        definition.onclick = undefined;
      }

      argumentsBox.replaceChildren();
      if (event.arguments && event.arguments.length) {
        event.arguments.forEach((argument, index) => {
          const row = document.createElement('div');
          row.className = 'arg';
          const raw = argument.raw || '(empty)';
          const expanded = argument.expanded || '(not expanded)';
          row.innerHTML = '<div class="subtle">argument ' + (index + 1) + '</div>' +
            '<div><code>' + escapeHtml(raw) + '</code> → <code>' + escapeHtml(expanded) + '</code></div>';
          argumentsBox.appendChild(row);
        });
      } else {
        argumentsBox.textContent = 'No arguments.';
      }

      steps.replaceChildren();
      if (event.steps && event.steps.length) {
        event.steps.forEach((step) => {
          const row = document.createElement('div');
          row.className = 'step';
          row.innerHTML = '<span class="op">' + escapeHtml(step.operation) + '</span><br>' +
            tokenDiff(step.before || '', step.after || '');
          steps.appendChild(row);
        });
      } else {
        steps.textContent = 'No # or ## steps for this event.';
      }

      slider.value = String(entry.index);
      counter.textContent = (entry.index + 1) + ' / ' + events.length;
      renderTree();
    }

    function stop() {
      playing = false;
      play.textContent = 'Play';
      if (timer) clearInterval(timer);
      timer = undefined;
    }

    function stepNext() {
      const entry = byId.get(currentId);
      const next = events[(entry?.index ?? 0) + 1];
      if (next) {
        currentId = next.id;
        render();
      }
    }

    function stepInto() {
      const child = (children.get(currentId) || [])[0];
      if (child) {
        currentId = child.id;
        render();
      } else {
        stepNext();
      }
    }

    function stepOver() {
      const entry = byId.get(currentId);
      if (!entry) return;
      const next = events[subtreeEndIndex(entry.event) + 1];
      if (next) {
        currentId = next.id;
        render();
      }
    }

    function stepOut() {
      const entry = byId.get(currentId);
      if (entry && byId.has(entry.event.parentId)) {
        currentId = entry.event.parentId;
        render();
      } else {
        stepNext();
      }
    }

    function jumpToMacro(query, fromIndex) {
      const needle = query.trim().toLowerCase();
      if (!needle) return;
      const start = fromIndex < 0 ? -1 : fromIndex;
      for (let offset = 1; offset <= events.length; offset++) {
        const index = (start + offset + events.length) % events.length;
        if (events[index] && events[index].macro.toLowerCase().includes(needle)) {
          stop();
          currentId = events[index].id;
          render();
          return;
        }
      }
    }

    function togglePlay() {
      if (playing) {
        stop();
        return;
      }
      if (events.length === 0) return;
      if (currentIndex() >= events.length - 1) {
        currentId = events[0].id;
        render();
      }
      playing = true;
      play.textContent = 'Pause';
      const speed = Number(document.getElementById('speed').value) || 1;
      timer = setInterval(() => {
        const index = currentIndex();
        if (index >= events.length - 1) {
          if (document.getElementById('loop').checked) {
            currentId = events[0].id;
            render();
          } else {
            stop();
          }
          return;
        }
        currentId = events[index + 1].id;
        render();
      }, 900 / speed);
    }

    play.addEventListener('click', togglePlay);
    document.getElementById('prev').addEventListener('click', () => {
      stop();
      const index = currentIndex();
      if (index > 0) {
        currentId = events[index - 1].id;
        render();
      }
    });
    document.getElementById('next').addEventListener('click', () => { stop(); stepNext(); });
    document.getElementById('stepInto').addEventListener('click', () => { stop(); stepInto(); });
    document.getElementById('stepOver').addEventListener('click', () => { stop(); stepOver(); });
    document.getElementById('stepOut').addEventListener('click', () => { stop(); stepOut(); });
    slider.addEventListener('input', () => {
      stop();
      const index = Number(slider.value);
      if (events[index]) {
        currentId = events[index].id;
        render();
      }
    });
    document.getElementById('openSource').addEventListener('click', () => {
      const entry = byId.get(currentId);
      if (!entry) return;
      const event = entry.event;
      vscode.postMessage({
        type: 'reveal',
        file: event.file,
        line: event.line,
        column: event.column,
        length: event.length || (event.invocation || '').length,
      });
    });
    document.getElementById('search').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        jumpToMacro(event.target.value, currentIndex());
      }
    });
    document.getElementById('openOutput').addEventListener('click', () => {
      vscode.postMessage({ type: 'open-output', path: data.outputPath });
    });
    document.addEventListener('keydown', (event) => {
      if (event.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
      else if (event.code === 'ArrowRight') { event.preventDefault(); stop(); stepNext(); }
      else if (event.code === 'ArrowLeft') { event.preventDefault(); stop(); const index = currentIndex(); if (index > 0) { currentId = events[index - 1].id; render(); } }
      else if (event.code === 'ArrowDown') { event.preventDefault(); stop(); stepOver(); }
      else if (event.code === 'ArrowUp') { event.preventDefault(); stop(); stepOut(); }
    });

    renderHotspots();
    render();
  </script>
</body>
</html>`;
}
