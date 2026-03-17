/**
 * Pitch. Location Autocomplete
 * Uses OpenStreetMap Nominatim (free, no API key, AU addresses only)
 * Usage: pitchLocAC('input-id', { suburbOnly: true, onSelect: fn })
 */
(function () {
  'use strict';

  const STYLE = `
    .pac-wrap { position: relative; }
    .pac-dropdown {
      position: absolute; left: 0; right: 0; top: calc(100% + 4px);
      background: #231E19; border: 1px solid #3A2E26;
      border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.55);
      z-index: 9999; overflow: hidden; display: none;
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

  let _timers = {};
  function debounce(key, fn, ms) {
    clearTimeout(_timers[key]);
    _timers[key] = setTimeout(fn, ms);
  }

  async function query(q, suburbOnly) {
    const params = new URLSearchParams({
      format: 'json',
      countrycodes: 'au',
      addressdetails: 1,
      limit: 6,
      q: q,
    });
    if (suburbOnly) {
      // bias toward settlements/suburbs
      params.append('featuretype', 'settlement');
    }
    try {
      const r = await fetch(
        'https://nominatim.openstreetmap.org/search?' + params,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'Pitch.au/1.0' } }
      );
      return await r.json();
    } catch (e) { return []; }
  }

  function fmt(item, suburbOnly) {
    const a = item.address || {};
    if (suburbOnly) {
      const place = a.suburb || a.quarter || a.neighbourhood || a.town || a.village || a.city_district || a.city || item.display_name.split(',')[0];
      const state = a.state || '';
      const pc    = a.postcode || '';
      return { main: place.trim(), sub: [state, pc].filter(Boolean).join(' ') };
    } else {
      const parts = item.display_name.split(',').map(s => s.trim());
      return { main: parts.slice(0, 2).join(', '), sub: parts.slice(2, 4).join(', ') };
    }
  }

  window.pitchLocAC = function (inputId, opts) {
    opts = opts || {};
    injectStyle();

    const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
    if (!input || input._pacBound) return;
    input._pacBound = true;

    const suburbOnly = !!opts.suburbOnly;
    const onSelect   = opts.onSelect || null;

    // Wrap
    const wrap = document.createElement('div');
    wrap.className = 'pac-wrap';
    // preserve existing wrapper styles
    wrap.style.cssText = 'display:block;';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const drop = document.createElement('div');
    drop.className = 'pac-dropdown';
    wrap.appendChild(drop);

    let results = [];
    let kbdIdx  = -1;

    function show() { drop.style.display = 'block'; }
    function hide() { drop.style.display = 'none'; kbdIdx = -1; }

    function render() {
      if (!results.length) { hide(); return; }
      drop.innerHTML = results.map((r, i) => {
        const f = fmt(r, suburbOnly);
        return `<div class="pac-item" data-i="${i}">
          <div class="pac-main">${f.main}</div>
          ${f.sub ? `<div class="pac-sub">${f.sub}</div>` : ''}
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
      const item = results[i];
      if (!item) return;
      const f   = fmt(item, suburbOnly);
      const a   = item.address || {};
      if (suburbOnly) {
        const suburb   = a.suburb || a.quarter || a.neighbourhood || a.town || a.village || a.city_district || a.city || f.main;
        const state    = a.state || 'SA';
        const postcode = a.postcode || '';
        input.value = suburb.trim();
        if (onSelect) onSelect({ suburb: suburb.trim(), state, postcode });
      } else {
        // Full address: first 3 parts of display_name
        const parts = item.display_name.split(',').map(s => s.trim());
        input.value = parts.slice(0, 3).join(', ');
        if (onSelect) onSelect({ display: item.display_name, address: a });
      }
      hide();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setKbd(n) {
      kbdIdx = n;
      drop.querySelectorAll('.pac-item').forEach((el, i) =>
        el.classList.toggle('kbd', i === kbdIdx)
      );
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (q.length < 2) { hide(); return; }
      debounce(inputId + '_pac', async () => {
        results = await query(q, suburbOnly);
        render();
      }, 280);
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
