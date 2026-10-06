/*!
 * T-Yel · pintado de cada hoja del almanaque (cuadrícula del mes, notas, colores y emojis)
 * © 2026 Yel Martínez — https://yel-martinez-portfolio.com
 * SPDX-License-Identifier: MIT
 *
 * No usa imágenes: cada hoja se dibuja por código a la medida del área disponible.
 * Diseño: cabecera de color con el nombre del mes (letra fina) y el año; fila de iniciales
 * D L M X J V S; cuadrícula de números grandes, con el día de hoy en un círculo de color.
 */
(function (root) {
  'use strict';

  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var INICIALES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  // color de cabecera y de fines de semana de cada mes
  var ACENTOS = ['#7B9EBE', '#E8A598', '#7BBC9A', '#C4A0C8', '#E8765A', '#5BB5D5', '#F0A45A', '#E07878', '#C8965A', '#7AAB7A', '#9898C8', '#5A8FC8'];
  var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",system-ui,sans-serif';
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  function key(y, m, d) {
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }

  function makeCanvas(w, h, dpr) {
    var c = document.createElement('canvas');
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    var ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    return { c: c, ctx: ctx };
  }

  /** Hoja del mes (año y, mes m) de w×h píxeles CSS, a resolución dpr. */
  function paintMonth(w, h, dpr, y, m, cal, now) {
    var o = makeCanvas(w, h, dpr), r = o.ctx;
    var accent = ACENTOS[m];
    var firstDay = new Date(y, m, 1).getDay(); // 0 = domingo
    var dim = daysIn(y, m);
    var rows = Math.ceil((firstDay + dim) / 7);
    var today = (now && now.getMonth() === m && now.getFullYear() === y) ? now.getDate() : -1;

    var pad = w * 0.05, hH = h * 0.15, bodyH = h - hH;
    var colW = (w - pad * 2) / 7;

    r.fillStyle = '#E8E8EA'; r.fillRect(0, 0, w, h);
    r.fillStyle = accent; r.fillRect(0, 0, w, hH);

    var fs = Math.min(hH * 0.55, w * 0.11);
    r.font = '300 ' + fs + 'px ' + FONT;
    r.fillStyle = '#FFFFFF'; r.textAlign = 'left'; r.textBaseline = 'alphabetic';
    r.fillText(MESES[m], pad, hH * 0.75);
    r.font = '300 ' + Math.round(fs * 0.32) + 'px ' + FONT;
    r.fillStyle = 'rgba(255,255,255,0.78)';
    r.fillText(String(y), pad + 2, hH * 0.93);

    r.fillStyle = '#EEEEF0'; r.fillRect(0, hH, w, bodyH);

    var wdSize = Math.round(w * 0.048), wdY = hH + bodyH * 0.09;
    r.font = '600 ' + wdSize + 'px ' + FONT; r.textBaseline = 'middle'; r.textAlign = 'center';
    for (var i = 0; i < 7; i++) {
      r.fillStyle = (i === 0 || i === 6) ? accent : '#777777';
      r.fillText(INICIALES[i], pad + colW * i + colW / 2, wdY);
    }

    var gridTop = hH + bodyH * 0.18, gridH = bodyH * 0.80, cellH = gridH / rows;
    var numSize = Math.round(w * 0.044), circR = Math.min(colW * 0.4, cellH * 0.4);

    for (var d = 1; d <= dim; d++) {
      var slot = firstDay + d - 1, col = slot % 7, row = Math.floor(slot / 7);
      var cx = pad + colW * col + colW / 2, cy = gridTop + row * cellH + cellH * 0.42;
      var isWE = col === 0 || col === 6;
      var entry = cal[key(y, m, d)] || {};

      if (entry.color) {
        r.save(); r.globalAlpha = 0.3; r.fillStyle = entry.color;
        r.fillRect(pad + colW * col, gridTop + row * cellH, colW, cellH);
        r.restore();
      }
      r.textAlign = 'center'; r.textBaseline = 'middle';
      if (d === today) {
        r.beginPath(); r.arc(cx, cy, circR, 0, Math.PI * 2); r.fillStyle = accent; r.fill();
        r.font = '600 ' + numSize + 'px ' + FONT; r.fillStyle = '#FFFFFF';
      } else {
        r.font = '400 ' + numSize + 'px ' + FONT; r.fillStyle = isWE ? accent : '#2A2A2E';
      }
      r.fillText(String(d), cx, cy);

      if (entry.nota) {
        var dotR = Math.max(5, cellH * 0.12);
        r.beginPath(); r.arc(cx, cy + cellH * 0.36, dotR, 0, Math.PI * 2); r.fillStyle = '#c9837a'; r.fill();
        r.beginPath(); r.arc(cx, cy + cellH * 0.36, dotR * 0.55, 0, Math.PI * 2); r.fillStyle = '#fff'; r.fill();
      }
      if (entry.emoji) {
        r.font = Math.max(14, Math.round(cellH * 0.32)) + 'px ' + EMOJI_FONT;
        r.textAlign = 'center'; r.textBaseline = 'middle';
        r.fillText(entry.emoji, cx + (entry.nota ? colW * 0.24 : 0), cy + cellH * 0.38);
      }
    }
    return o.c;
  }

  /** Hoja de fin de año. */
  function paintEnd(w, h, dpr, y) {
    var o = makeCanvas(w, h, dpr), r = o.ctx, accent = '#c9837a';
    var g = r.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1714'); g.addColorStop(1, accent + '44');
    r.fillStyle = g; r.fillRect(0, 0, w, h);

    var yearFs = Math.min(w * 0.22, h * 0.34);
    r.font = '800 ' + yearFs + 'px ' + FONT; r.fillStyle = 'rgba(255,255,255,0.12)';
    r.textAlign = 'center'; r.textBaseline = 'middle';
    r.fillText(String(y + 1), w / 2, h * 0.36);

    r.font = '300 ' + Math.min(w * 0.055, h * 0.075) + 'px ' + FONT; r.fillStyle = 'rgba(255,255,255,0.88)';
    r.fillText('Año completado', w / 2, h * 0.54);
    r.font = '300 ' + Math.min(w * 0.038, h * 0.05) + 'px ' + FONT; r.fillStyle = 'rgba(255,255,255,0.5)';
    r.fillText('Has arrancado todas las hojas de ' + y, w / 2, h * 0.62);

    r.strokeStyle = accent; r.lineWidth = 2; r.globalAlpha = 0.5;
    r.beginPath(); r.moveTo(w * 0.3, h * 0.69); r.lineTo(w * 0.7, h * 0.69); r.stroke();
    r.globalAlpha = 1;
    return o.c;
  }

  var api = { MESES: MESES, ACENTOS: ACENTOS, key: key, daysIn: daysIn, paintMonth: paintMonth, paintEnd: paintEnd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TyelSheet = api;
})(typeof self !== 'undefined' ? self : this);
