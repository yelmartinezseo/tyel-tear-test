/*!
 * T-Yel · aplicación: hojas desgarrables, notas, colores y emojis
 * © 2026 Yel Martínez — https://yel-martinez-portfolio.com
 * SPDX-License-Identifier: MIT
 *
 * Todo ocurre en tu navegador: las notas se guardan solo en localStorage y no se envían a ningún servidor.
 */
(function () {
  'use strict';

  var Cloth = TyelCloth.Cloth, Sheet = TyelSheet;
  var STORE = 'tyc_v10'; // misma clave que la versión anterior: las notas ya guardadas se conservan
  var SW = ['#FFD93D', '#FF9A3C', '#FF7878', '#FF4C6A', '#C47ED6', '#7A6FD8', '#5B9BF0', '#3AC569', '#2BD4C4', '#888888'];
  var EM = ['⭐', '❤️', '🎯', '✅', '⚠️', '💡', '🎉', '📅', '🔔', '🎂', '💬', '✏️', '🏃', '💪', '🍎', '☕', '🌙', '✨', '🌱', '📌', '🔥', '🎵', '📝', '🏆'];
  var DNS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function $(id) { return document.getElementById(id); }
  var canvas = $('stage');
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── dibujo: WebGL, o hoja plana si no hay WebGL ──
  var glr = null, ctx2d = null;
  try { glr = new TyelGLLib.TyelGL(canvas); } catch (e) { glr = null; ctx2d = canvas.getContext('2d'); }

  // ── datos del usuario ──
  var cal = {};
  try { cal = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { cal = {}; }
  var rev = 0, texCache = {}, graveyard = [];
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(cal)); } catch (e) { /* sin almacenamiento */ }
    clearTextures(); dirty = true;
  }
  function clearTextures() {
    rev++;
    Object.keys(texCache).forEach(function (k) { graveyard.push({ t: texCache[k], at: performance.now() }); });
    texCache = {};
  }
  function sweepGraveyard(t) {
    for (var i = graveyard.length - 1; i >= 0; i--) {
      if (t - graveyard[i].at > 2500 && glr) { glr.free(graveyard[i].t.gl); graveyard.splice(i, 1); }
    }
  }

  // ── cursor: la hoja que se ve (mes) o la de fin de año ──
  var now = new Date();
  function next(e) { return e.end ? { y: e.y + 1, m: 0 } : (e.m === 11 ? { end: true, y: e.y } : { y: e.y, m: e.m + 1 }); }
  function prev(e) { return e.end ? { y: e.y, m: 11 } : (e.m === 0 ? { end: true, y: e.y - 1 } : { y: e.y, m: e.m - 1 }); }
  function label(e) { return e.end ? 'Fin del año ' + e.y : Sheet.MESES[e.m] + ' ' + e.y; }

  var front = null, falling = [], torn = [];
  var view = { w: 0, h: 0, dpr: 1, rect: { x: 0, y: 0, w: 0, h: 0 } };
  var dirty = true, dragging = false, last = 0;

  function texFor(entry) {
    var k = (entry.end ? 'end' + entry.y : entry.y + '-' + entry.m) + '@' + rev;
    if (!texCache[k]) {
      var td = Math.min(view.dpr, 2048 / Math.max(view.w, view.h));
      var c = entry.end ? Sheet.paintEnd(view.w, view.h, td, entry.y) : Sheet.paintMonth(view.w, view.h, td, entry.y, entry.m, cal, new Date());
      texCache[k] = { canvas: c, gl: glr ? glr.texture(c) : null };
    }
    return texCache[k];
  }

  function makeFront(entry) {
    var f = { entry: entry, cloth: null };
    if (!entry.end && glr) {
      var cell = Math.max(26, Math.sqrt(view.w * view.h / 1000)); // celda ≈ 26–30 px: pliegues más finos
      var cols = Math.max(10, Math.min(44, Math.round(view.w / cell)));
      var rows = Math.max(10, Math.min(32, Math.round(view.h / cell)));
      f.cloth = new Cloth({ cols: cols, rows: rows, width: view.w, height: view.h, x: 0, y: 0 });
    }
    $('tyel-reinicio-btn').style.display = entry.end ? 'flex' : 'none';
    if (entry.end) $('btn-reinicio').textContent = '↺ Empezar ' + (entry.y + 1);
    $('stage-status').textContent = label(entry);
    dirty = true;
    return f;
  }

  // ── tamaño ──
  function layout() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    view = { w: w, h: h, dpr: dpr, rect: { x: 0, y: 0, w: w, h: h } };
    if (glr) glr.resize(w, h);
    else ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearTextures();
  }

  // ── tiras de meses arrancados (cabecera) ──
  function renderAcc() {
    var el = $('acc-stack'); el.innerHTML = '';
    torn.slice(-4).forEach(function (it, i, arr) {
      var d = document.createElement('div');
      d.className = 'acc-strip';
      d.style.cssText = 'background:' + Sheet.ACENTOS[it.m] + ';transform:translateY(' + ((arr.length - 1 - i) * 4) + 'px);opacity:' + (0.4 + i * 0.15) + ';z-index:' + (986 + i);
      d.textContent = Sheet.MESES[it.m] + ' ' + it.y;
      el.appendChild(d);
    });
  }

  // ── navegación ──
  function onTorn() {
    var old = front, e = old.entry;
    if (old.cloth && !reduceMotion) falling.push({ cloth: old.cloth, tex: texFor(e), age: 0 });
    dragging = false; if (old.cloth) old.cloth.drop(); canvas.classList.remove('grabbing');
    if (!e.end) torn.push({ y: e.y, m: e.m });
    front = makeFront(next(e));
    renderAcc();
  }
  function goBack() {
    var p = prev(front.entry);
    falling = [];
    if (torn.length) torn.pop();
    front = makeFront(p);
    renderAcc();
    toast('↺ ' + label(p));
  }
  function goToday() {
    var t = new Date();
    falling = []; torn = [];
    front = makeFront({ y: t.getFullYear(), m: t.getMonth() });
    renderAcc();
    toast('Hoy · ' + label(front.entry));
  }
  function restart() {
    var e = front.entry;
    falling = [];
    front = makeFront(next(e));
    renderAcc();
    toast('¡Bienvenida a ' + (e.y + 1) + '!');
  }

  // ── dibujo ──
  function draw() {
    if (!glr) {
      var t = texFor(front.entry);
      ctx2d.drawImage(t.canvas, 0, 0, view.w, view.h);
      return;
    }
    glr.begin();
    glr.drawFlat(texFor(next(front.entry)).gl, view.rect);
    var ft = texFor(front.entry);
    if (!front.cloth || front.cloth.isSettled()) glr.drawFlat(ft.gl, view.rect);
    else { glr.drawShadow(front.cloth, 1); glr.drawCloth(front.cloth, ft.gl, 1); }
    for (var i = 0; i < falling.length; i++) {
      var f = falling[i], a = Math.max(0, 1 - Math.max(0, f.age - 1.0) / 0.8);
      glr.drawShadow(f.cloth, a);
      glr.drawCloth(f.cloth, f.tex.gl, a);
    }
  }

  function frame(t) {
    var dt = Math.min(0.033, (t - last) / 1000 || 0.016); last = t;
    if (front && front.cloth) {
      var c = front.cloth;
      if (!c.isSettled() || dragging) {
        c.step(dt); dirty = true;
        if (c.detached) onTorn();
      }
    }
    for (var i = falling.length - 1; i >= 0; i--) {
      var f = falling[i];
      f.cloth.step(dt); f.age += dt; dirty = true;
      if (f.age > 1.8 || f.cloth.bounds().minY > view.h + 80) falling.splice(i, 1);
    }
    sweepGraveyard(t);
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }

  // ── puntero y teclado ──
  function pt(e) {
    var b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!front) return;
    if (!front.cloth) { if (!glr && !front.entry.end) { onTorn(); } return; }
    if (front.cloth.detached) return;
    var p = pt(e), c = front.cloth;
    if (c.grab(p.x, p.y, Math.max(c.sx, c.sy) * 1.7)) {
      dragging = true; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); e.preventDefault();
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging || !front || !front.cloth) return;
    var p = pt(e), c = front.cloth;
    c.move(p.x, p.y);
    // con perspectiva, lo que está más cerca se ve ampliado: compensa para que el punto agarrado siga bajo el dedo
    var ce = glr.center(), s = glr.dist / (glr.dist - c.lift);
    c.pointer.x = ce.x + (p.x - ce.x) / s;
    c.pointer.y = ce.y + (p.y - ce.y) / s;
  });
  function release() {
    if (front && front.cloth) front.cloth.drop();
    dragging = false; canvas.classList.remove('grabbing');
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && front && !front.entry.end) {
      e.preventDefault();
      if (front.cloth && !front.cloth.detached) front.cloth.autoTear();
      onTorn();
    }
  });

  // ── paneles de nota, color y emoji ──
  var pD = [1, 1, 1], pMo = [0, 0, 0], pY = [0, 0, 0];
  function K(y, m, d) { return Sheet.key(y, m, d); }
  function fd(y, m, d) { return DNS[new Date(y, m, d).getDay()] + ' ' + d + ' de ' + Sheet.MESES[m].toLowerCase() + ' ' + y; }
  function curMonth() {
    var e = front.entry;
    return e.end ? { y: e.y, m: 11 } : { y: e.y, m: e.m };
  }
  function resetPanelDay() {
    var c = curMonth();
    var d = (now.getFullYear() === c.y && now.getMonth() === c.m) ? now.getDate() : 1;
    for (var i = 0; i < 3; i++) { pD[i] = d; pMo[i] = c.m; pY[i] = c.y; }
  }
  function refresh(t) {
    var y = pY[t], m = pMo[t], d = pD[t], txt = fd(y, m, d), k = K(y, m, d);
    if (t === 0) {
      $('tyel-ntit').textContent = 'Nota · ' + Sheet.MESES[m]; $('tyel-nday').textContent = txt;
      $('tyel-ntxt').value = (cal[k] && cal[k].nota) || '';
    } else if (t === 1) {
      $('tyel-ctit').textContent = 'Color · ' + Sheet.MESES[m]; $('tyel-cday').textContent = txt;
      var cur = (cal[k] || {}).color || '';
      var g = $('tyel-cgrid'); g.innerHTML = '';
      SW.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'sw' + (cur === c ? ' sel' : ''); b.style.background = c;
        b.setAttribute('aria-label', 'Color ' + c);
        b.addEventListener('click', function () { setField(1, 'color', c, 'Color aplicado ✓'); });
        g.appendChild(b);
      });
    } else {
      $('tyel-etit').textContent = 'Emoji · ' + Sheet.MESES[m]; $('tyel-eday').textContent = txt;
      $('tyel-curem').textContent = (cal[k] || {}).emoji || '';
      var eg = $('tyel-egrid'); eg.innerHTML = '';
      EM.forEach(function (em) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'eb'; b.textContent = em; b.setAttribute('aria-label', 'Emoji ' + em);
        b.addEventListener('click', function () { setField(2, 'emoji', em, em + ' añadido ✓'); });
        eg.appendChild(b);
      });
    }
  }
  var PANELS = ['tyel-pnota', 'tyel-pcolor', 'tyel-pemoji'];
  function openPanel(t) {
    closeAll(); resetPanelDay(); refresh(t);
    $(PANELS[t]).classList.add('open'); $('tyel-ov').classList.add('on');
    if (t === 0) setTimeout(function () { $('tyel-ntxt').focus(); }, 350);
  }
  function closeAll() {
    PANELS.forEach(function (id) { $(id).classList.remove('open'); });
    $('tyel-ov').classList.remove('on');
  }
  function shift(t, d) {
    var dd = pD[t] + d, m = pMo[t], y = pY[t];
    if (dd < 1) { m--; if (m < 0) { m = 11; y--; } dd = Sheet.daysIn(y, m); }
    else if (dd > Sheet.daysIn(y, m)) { m++; if (m > 11) { m = 0; y++; } dd = 1; }
    pD[t] = dd; pMo[t] = m; pY[t] = y; refresh(t);
  }
  function setField(t, field, val, msg) {
    var k = K(pY[t], pMo[t], pD[t]);
    if (!cal[k]) cal[k] = {};
    if (val) cal[k][field] = val; else delete cal[k][field];
    if (!Object.keys(cal[k]).length) delete cal[k];
    persist(); closeAll(); toast(msg);
  }

  document.querySelectorAll('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () { openPanel(parseInt(b.getAttribute('data-open'), 10)); });
  });
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeAll); });
  document.querySelectorAll('[data-shift]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = b.getAttribute('data-shift').split(',');
      shift(parseInt(p[0], 10), parseInt(p[1], 10));
    });
  });
  $('tyel-ov').addEventListener('click', closeAll);
  $('btn-save-nota').addEventListener('click', function () { setField(0, 'nota', $('tyel-ntxt').value.trim(), 'Nota guardada ✓'); });
  $('btn-del-nota').addEventListener('click', function () { setField(0, 'nota', '', 'Nota borrada'); });
  $('btn-clear-color').addEventListener('click', function () { setField(1, 'color', '', 'Color quitado'); });
  $('btn-clear-emoji').addEventListener('click', function () { setField(2, 'emoji', '', 'Emoji quitado'); });
  $('btn-volver').addEventListener('click', goBack);
  $('btn-hoy').addEventListener('click', goToday);
  $('btn-reinicio').addEventListener('click', restart);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  var tt;
  function toast(msg) {
    var t = $('tyel-toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 1900);
  }

  // ── arranque ──
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { layout(); falling = []; front = makeFront(front.entry); }, 120);
  });

  layout();
  front = makeFront({ y: now.getFullYear(), m: now.getMonth() });
  requestAnimationFrame(frame);
})();
