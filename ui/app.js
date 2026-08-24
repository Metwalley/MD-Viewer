(() => {
  'use strict';

  const T = window.__TAURI__;
  const invoke = T.core.invoke;
  const listen = T.event.listen;
  const win = T.window.getCurrentWindow();

  const md = window.markdownit({
    html: true,
    linkify: true,
    breaks: false,
    typographer: false,
    highlight(str, lang) {
      const esc = md.utils.escapeHtml(str);
      if (lang && window.hljs && window.hljs.getLanguage(lang)) {
        try {
          return '<pre class="hljs"><code>' +
            window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
            '</code></pre>';
        } catch (_) { /* fall through to plain */ }
      }
      return '<pre class="hljs"><code>' + esc + '</code></pre>';
    }
  });

  const $ = (id) => document.getElementById(id);
  const tabsEl = $('tabs');
  const previewEl = $('preview');
  const mdBody = $('md-body');
  const codeview = $('codeview');
  const editor = $('editor');
  const gutter = $('gutter');
  const emptyState = $('empty-state');
  const crumb = $('crumb');
  const statusPath = $('status-path');
  const statusInfo = $('status-info');
  const segPreview = $('mode-preview');
  const segCode = $('mode-code');
  const modalBackdrop = $('modal-backdrop');
  const modalMsg = $('modal-msg');
  const modalOk = $('modal-ok');
  const modalCancel = $('modal-cancel');

  let tabs = [];
  let activeId = null;
  let tabSeq = 0;

  const active = () => tabs.find((t) => t.id === activeId) || null;

  function askConfirm(msg, okLabel, cancelLabel) {
    return new Promise((resolve) => {
      modalMsg.textContent = msg;
      modalOk.textContent = okLabel || 'OK';
      if (cancelLabel === null) {
        modalCancel.classList.add('hidden');
      } else {
        modalCancel.textContent = cancelLabel || 'Cancel';
        modalCancel.classList.remove('hidden');
      }
      modalBackdrop.classList.remove('hidden');
      const done = (v) => {
        modalBackdrop.classList.add('hidden');
        modalOk.removeEventListener('click', onOk);
        modalCancel.removeEventListener('click', onCancel);
        resolve(v);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      modalOk.addEventListener('click', onOk);
      modalCancel.addEventListener('click', onCancel);
      modalOk.focus();
    });
  }

  function addTab(f) {
    const existing = tabs.find((t) => t.path.toLowerCase() === f.path.toLowerCase());
    if (existing) { activate(existing.id); return; }
    const tab = {
      id: ++tabSeq,
      path: f.path,
      name: f.name,
      content: f.content,
      original: f.content,
      encoding: f.encoding,
      bom: f.encoding === 'UTF-8 BOM',
      mode: 'preview',
      dirty: false,
      html: null,
      scroll: { preview: 0, code: 0 }
    };
    tabs.push(tab);
    activate(tab.id);
  }

  function activate(id) {
    activeId = id;
    updateTabs();
    renderActive();
  }

  async function closeTab(id) {
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    const t = tabs[i];
    if (t.dirty) {
      const ok = await askConfirm('"' + t.name + '" has unsaved changes.\nClose without saving?', 'Close', 'Cancel');
      if (!ok) return;
    }
    tabs.splice(i, 1);
    if (activeId === id) {
      activeId = null;
      const next = tabs[i] || tabs[i - 1];
      if (next) activate(next.id);
      else { updateTabs(); renderActive(); }
    } else {
      updateTabs();
    }
  }

  function cycle(dir) {
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.id === activeId);
    activate(tabs[(i + dir + tabs.length) % tabs.length].id);
  }

  function updateTabs() {
    tabsEl.textContent = '';
    for (const t of tabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (t.id === activeId ? ' active' : '') + (t.dirty ? ' dirty' : '');
      el.title = t.path;
      const name = document.createElement('span');
      name.className = 'tab-name';
      name.textContent = t.name;
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.textContent = t.dirty ? '\u25CF' : '\u2715';
      close.title = 'Close (Ctrl+W)';
      close.tabIndex = -1;
      close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id); });
      el.append(name, close);
      el.addEventListener('click', () => { if (t.id !== activeId) activate(t.id); });
      el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t.id); });
      tabsEl.appendChild(el);
    }
  }

  function renderMarkdown(tab) {
    if (tab.html === null) tab.html = md.render(tab.content);
    mdBody.innerHTML = tab.html;
    mdBody.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,dd,dt,caption,figcaption,summary'
    ).forEach((el) => el.setAttribute('dir', 'auto'));
    mdBody.querySelectorAll('a[href]').forEach((a) => a.setAttribute('rel', 'noopener noreferrer'));
    applyTaskLists();
    addCopyButtons();
  }

  function applyTaskLists() {
    mdBody.querySelectorAll('li').forEach((li) => {
      let node = li.firstChild;
      let parent = li;
      if (node && node.nodeName === 'P') { parent = node; node = node.firstChild; }
      if (!node || node.nodeType !== 3) return;
      const m = node.textContent.match(/^\[([ xX])\]\s+/);
      if (!m) return;
      node.textContent = node.textContent.slice(m[0].length);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.disabled = true;
      cb.checked = m[1] !== ' ';
      parent.insertBefore(cb, node);
      li.classList.add('task-item');
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function addCopyButtons() {
    mdBody.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await copyText(pre.innerText.replace(/\n$/, ''));
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      });
      pre.appendChild(btn);
    });
  }

  function buildGutter(content) {
    const lines = content.split('\n').length;
    const parts = new Array(lines);
    for (let i = 0; i < lines; i++) parts[i] = i + 1;
    gutter.textContent = parts.join('\n');
  }

  function renderActive() {
    const t = active();
    emptyState.classList.toggle('hidden', !!t);
    previewEl.classList.toggle('hidden', !t || t.mode !== 'preview');
    codeview.classList.toggle('hidden', !t || t.mode !== 'code');
    segPreview.classList.toggle('active', !!t && t.mode === 'preview');
    segCode.classList.toggle('active', !!t && t.mode === 'code');
    if (!t) {
      crumb.textContent = '';
      statusPath.textContent = '';
      statusInfo.textContent = tabs.length === 0 ? 'No file open' : tabs.length + ' tabs';
      win.setTitle('MD-Viewer');
      return;
    }
    if (t.mode === 'preview') {
      renderMarkdown(t);
      previewEl.scrollTop = t.scroll.preview;
    } else {
      editor.value = t.content;
      buildGutter(t.content);
      editor.setSelectionRange(0, 0);
      gutter.scrollTop = t.scroll.code;
      editor.scrollTop = t.scroll.code;
    }
    crumb.textContent = t.path;
    crumb.title = t.path;
    statusPath.textContent = t.path;
    statusPath.title = t.path;
    statusInfo.textContent =
      (t.mode === 'preview' ? 'Preview' : 'Code') + ' \u00B7 ' + t.encoding +
      ' \u00B7 ' + t.content.split('\n').length + ' lines' + (t.dirty ? ' \u00B7 modified' : '');
    win.setTitle(t.name + ' - MD-Viewer');
  }

  function setMode(mode) {
    const t = active();
    if (!t || t.mode === mode) return;
    if (t.mode === 'preview') t.scroll.preview = previewEl.scrollTop;
    else t.scroll.code = editor.scrollTop;
    t.mode = mode;
    renderActive();
    if (mode === 'code') editor.focus();
  }

  function toggleMode() {
    const t = active();
    if (!t) return;
    setMode(t.mode === 'preview' ? 'code' : 'preview');
  }

  async function openFilesDialog() {
    try {
      const f = await invoke('open_dialog');
      if (f) addTab(f);
    } catch (e) {
      console.error(e);
    }
  }

  async function openPaths(paths) {
    for (const p of paths || []) {
      try {
        addTab(await invoke('read_markdown', { path: p }));
      } catch (e) {
        console.error('Failed to open', p, e);
      }
    }
  }

  async function saveActive() {
    const t = active();
    if (!t) return;
    try {
      await invoke('save_markdown', { path: t.path, content: t.content, bom: t.bom });
      t.original = t.content;
      t.dirty = false;
      updateTabs();
      renderActive();
    } catch (e) {
      askConfirm('Save failed:\n' + e, 'OK', null);
    }
  }

  editor.addEventListener('input', () => {
    const t = active();
    if (!t) return;
    t.content = editor.value;
    t.html = null;
    t.dirty = t.content !== t.original;
    buildGutter(t.content);
    const idx = tabs.indexOf(t);
    const tabEl = tabsEl.children[idx];
    if (tabEl) {
      tabEl.classList.toggle('dirty', t.dirty);
      const c = tabEl.querySelector('.tab-close');
      if (c) c.textContent = t.dirty ? '\u25CF' : '\u2715';
    }
    statusInfo.textContent =
      'Code \u00B7 ' + t.encoding + ' \u00B7 ' + t.content.split('\n').length +
      ' lines' + (t.dirty ? ' \u00B7 modified' : '');
  });

  editor.addEventListener('scroll', () => {
    gutter.scrollTop = editor.scrollTop;
    const t = active();
    if (t) t.scroll.code = editor.scrollTop;
  });

  previewEl.addEventListener('scroll', () => {
    const t = active();
    if (t && t.mode === 'preview') t.scroll.preview = previewEl.scrollTop;
  });

  mdBody.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href') || '';
    if (/^(https?:\/\/|mailto:)/i.test(href)) invoke('open_external', { url: href });
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (k === 'o') { e.preventDefault(); openFilesDialog(); }
      else if (k === 'w') { e.preventDefault(); if (activeId !== null) closeTab(activeId); }
      else if (k === 's') { e.preventDefault(); saveActive(); }
      else if (e.key === 'Tab') { e.preventDefault(); cycle(1); }
    } else if (e.ctrlKey && e.shiftKey) {
      if (e.key === 'Tab') { e.preventDefault(); cycle(-1); }
      else if (k === 'v') { e.preventDefault(); toggleMode(); }
    }
  });

  $('btn-min').addEventListener('click', () => win.minimize());
  $('btn-max').addEventListener('click', () => win.toggleMaximize());
  $('btn-close').addEventListener('click', () => win.close());
  $('btn-open').addEventListener('click', openFilesDialog);
  $('new-tab').addEventListener('click', openFilesDialog);
  segPreview.addEventListener('click', () => setMode('preview'));
  segCode.addEventListener('click', () => setMode('code'));
  tabsEl.addEventListener('dblclick', (e) => { if (e.target === tabsEl) openFilesDialog(); });

  async function refreshMaxGlyph() {
    const m = await win.isMaximized().catch(() => false);
    $('btn-max').textContent = m ? '\u2750' : '\u25A1';
  }
  win.onResized(() => refreshMaxGlyph());
  refreshMaxGlyph();

  listen('open-paths', (e) => openPaths(e.payload));

  (async () => {
    try {
      const paths = await invoke('initial_paths');
      if (paths && paths.length) await openPaths(paths);
      else renderActive();
    } catch (_) {
      renderActive();
    }
  })();
})();
