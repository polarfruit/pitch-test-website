/**
 * Pitch. Location Autocomplete
 * Local suburb dataset (instant) + optional Nominatim fallback.
 * Usage: pitchLocAC('input-id', { suburbOnly: true, onSelect: fn })
 */
(function () {
  'use strict';

  const STYLE = `
    .pac-wrap { position: relative; }
    .pac-dropdown {
      position: absolute; left: 0; right: 0; top: calc(100% + 6px);
      background: #231E19; border: 1px solid #3A2E26;
      border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.55);
      z-index: 9999; overflow: hidden; display: none;
      min-width: 260px;
    }
    .pac-item {
      padding: 10px 14px; cursor: pointer;
      border-bottom: 1px solid #2A2018;
      transition: background 0.1s;
    }
    .pac-item:last-child { border-bottom: none; }
    .pac-item:hover, .pac-item.kbd { background: #2E2720; }
    .pac-main { font-size: 13px; font-weight: 600; color: #FDF4E7; }
    .pac-sub  { font-size: 11px; color: #6B5A4A; margin-top: 2px; }
  `;

  let _styleInjected = false;
  function injectStyle() {
    if (_styleInjected) return;
    _styleInjected = true;
    const s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  // ── Local suburb search ─────────────────────────────────────────────────
  const POSTCODE_RE = /^\d+$/;

  function searchLocal(q) {
    const data = window.PITCH_SUBURBS;
    if (!data || !data.length) return [];
    const trimmed = q.trim();
    if (!trimmed) return [];

    const MAX = 3;
    const rank = e => (e[1] === 'SA' ? 0 : 1);

    // ── Postcode mode ──────────────────────────────────────────────────────
    if (POSTCODE_RE.test(trimmed)) {
      const matches = data.filter(e => e[2].startsWith(trimmed));
      matches.sort((a, b) => rank(a) - rank(b) || a[0].localeCompare(b[0]));
      return matches.slice(0, MAX);
    }

    // ── Name mode ──────────────────────────────────────────────────────────
    const lower = trimmed.toLowerCase();
    const starts = [];
    const contains = [];
    for (const entry of data) {
      if (starts.length >= MAX) break;
      const name = entry[0].toLowerCase();
      if (name.startsWith(lower)) starts.push(entry);
      else if (name.includes(lower) && contains.length < MAX) contains.push(entry);
    }
    starts.sort((a, b) => rank(a) - rank(b) || a[0].localeCompare(b[0]));
    contains.sort((a, b) => rank(a) - rank(b) || a[0].localeCompare(b[0]));
    return [...starts, ...contains].slice(0, MAX);
  }

  let _timers = {};
  function debounce(key, fn, ms) {
    clearTimeout(_timers[key]);
    _timers[key] = setTimeout(fn, ms);
  }

  window.pitchLocAC = function (inputId, opts) {
    opts = opts || {};
    injectStyle();

    const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
    if (!input || input._pacBound) return;
    input._pacBound = true;

    const onSelect = opts.onSelect || null;

    // Wrap input in .pac-wrap
    const wrap = document.createElement('div');
    wrap.className = 'pac-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const drop = document.createElement('div');
    drop.className = 'pac-dropdown';
    wrap.appendChild(drop);

    let localResults = [];
    let kbdIdx = -1;
    let _suppressNext = false;

    function show() { drop.style.display = 'block'; }
    function hide() { drop.style.display = 'none'; kbdIdx = -1; }

    function render(items) {
      if (!items || !items.length) { hide(); return; }
      localResults = items;
      drop.innerHTML = items.map((r, i) => {
        const [name, state, postcode] = r;
        return `<div class="pac-item" data-i="${i}">
          <div class="pac-main">${name}</div>
          <div class="pac-sub">${state}${postcode ? ' ' + postcode : ''}</div>
        </div>`;
      }).join('');
      show();
      drop.querySelectorAll('.pac-item').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          pick(parseInt(el.dataset.i, 10));
        });
      });
    }

    function pick(i) {
      const item = localResults[i];
      if (!item) return;
      const [name, state, postcode] = item;
      input.value = name;
      hide();
      if (onSelect) onSelect({ suburb: name, state, postcode });
      _suppressNext = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setKbd(n) {
      kbdIdx = n;
      drop.querySelectorAll('.pac-item').forEach((el, i) =>
        el.classList.toggle('kbd', i === kbdIdx)
      );
    }

    input.addEventListener('input', () => {
      if (_suppressNext) { _suppressNext = false; return; }
      const q = input.value.trim();
      if (q.length < 2) { hide(); return; }
      // Instant local results
      const hits = searchLocal(q);
      render(hits);
    });

    input.addEventListener('keydown', e => {
      const items = drop.querySelectorAll('.pac-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setKbd(Math.min(kbdIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setKbd(Math.max(kbdIdx - 1, -1));
      } else if (e.key === 'Enter' && kbdIdx >= 0) {
        e.preventDefault();
        pick(kbdIdx);
      } else if (e.key === 'Escape') {
        hide();
      }
    });

    input.addEventListener('blur', () => setTimeout(hide, 150));
  };
})();
