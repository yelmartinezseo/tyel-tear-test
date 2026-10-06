/*!
 * T-Yel · simulación de tela en 3D (Verlet + restricciones de distancia + rotura)
 * © 2026 Yel Martínez — https://yel-martinez-portfolio.com
 * SPDX-License-Identifier: MIT
 *
 * Código propio, sin dependencias. Funciona en el navegador y en Node.
 *
 * Una malla de cols × rows partículas con posición (x, y, z): x hacia la derecha,
 * y hacia abajo, z hacia quien mira. Cada partícula guarda su posición actual y la
 * anterior (integración de Verlet). Las restricciones de distancia mantienen la
 * separación entre vecinas; si una se estira más de su umbral, se rompe. La fila
 * superior está unida a las anillas por una perforación con umbral más bajo. Detrás
 * de la hoja hay una pared (z = 0) que impide atravesar la hoja siguiente.
 */
(function (root) {
  'use strict';

  var KIND_H = 0, KIND_V = 1, KIND_SHEAR = 2, KIND_PERF = 3, KIND_BEND = 4;

  function Cloth(o) {
    o = o || {};
    this.cols = o.cols || 16;
    this.rows = o.rows || 20;
    this.width = o.width || 400;
    this.height = o.height || 500;
    this.ox = o.x || 0;
    this.oy = o.y || 0;
    this.gravity = o.gravity != null ? o.gravity : this.height * 3.4;   // papel: ligero, cae con soltura
    this.damping = o.damping != null ? o.damping : 0.988;
    this.iterations = o.iterations || 14;
    this.substeps = o.substeps || 2;
    this.tearBody = o.tearBody || 2.0;   // razón de estiramiento que rompe el cuerpo de la hoja (rasga por donde se tira)
    this.tearPerf = o.tearPerf || 1.18;  // ídem para la perforación (más débil: se rasga con un tirón corto)
    this.tearShear = o.tearShear || 3.2;
    this.bendStiff = o.bendStiff != null ? o.bendStiff : 0.5;  // 0 = tela suelta, 1 = muy rígido

    var n = this.cols * this.rows;
    this.n = n;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.pinned = new Uint8Array(n);
    this.held = new Uint8Array(n);
    this.hx = new Float32Array(n); this.hy = new Float32Array(n); // desplazamiento respecto al puntero

    // La primera fila es muy fina: es la línea de rasgado. Al romperse solo se pierden unos píxeles, no una celda entera.
    var sx = this.width / (this.cols - 1);
    var thin = Math.min(5, this.height / (this.rows - 1) * 0.2);
    var sy = (this.height - thin) / (this.rows - 2);
    this.sx = sx; this.sy = sy;
    this.rowY = new Float32Array(this.rows);   // y de reposo de cada fila (relativa al borde superior)
    this.rowV = new Float32Array(this.rows);   // fracción de la altura (coordenada v de la textura)
    for (var rj = 1; rj < this.rows; rj++) this.rowY[rj] = thin + (rj - 1) * sy;
    for (rj = 0; rj < this.rows; rj++) this.rowV[rj] = this.rowY[rj] / this.height;
    this.maxSpeed = o.maxSpeed || Math.max(sx, sy) * 0.9; // px por subpaso
    this.maxLift = o.maxLift || Math.min(this.width, this.height) * 0.5;

    var i, j;
    for (j = 0; j < this.rows; j++) {
      for (i = 0; i < this.cols; i++) {
        var k = j * this.cols + i;
        this.x[k] = this.px[k] = this.ox + i * sx;
        this.y[k] = this.py[k] = this.oy + this.rowY[j];
        this.z[k] = this.pz[k] = 0;
      }
    }
    if (o.pinTop !== false) for (i = 0; i < this.cols; i++) this.pinned[i] = 1;

    this.ca = []; this.cb = []; this.rest = []; this.kind = []; this.alive = [];
    this.dep1 = []; this.dep2 = [];
    this.hIdx = new Int32Array(n).fill(-1); this.vIdx = new Int32Array(n).fill(-1);
    for (j = 0; j < this.rows; j++) {
      for (i = 0; i < this.cols; i++) {
        var a = j * this.cols + i;
        if (i < this.cols - 1) { this.hIdx[a] = this.ca.length; this._add(a, a + 1, sx, KIND_H); }
        if (j < this.rows - 1) { this.vIdx[a] = this.ca.length; this._add(a, a + this.cols, this.rowY[j + 1] - this.rowY[j], j === 0 ? KIND_PERF : KIND_V); }
        if (i < this.cols - 1 && j < this.rows - 1) {
          var d = Math.sqrt(sx * sx + (this.rowY[j + 1] - this.rowY[j]) * (this.rowY[j + 1] - this.rowY[j]));
          this._add(a, a + this.cols + 1, d, KIND_SHEAR);
          this._add(a + 1, a + this.cols, d, KIND_SHEAR);
        }
      }
    }
    // Rigidez a la flexión: el papel no se arruga como una tela, se curva. Une cada partícula con la de
    // dos lugares más allá; solo existe mientras sigan enteras las dos restricciones que la sostienen.
    for (j = 0; j < this.rows; j++) {
      for (i = 0; i < this.cols; i++) {
        var q = j * this.cols + i;
        if (i < this.cols - 2) this._addBend(q, q + 2, 2 * sx, this.hIdx[q], this.hIdx[q + 1]);
        if (j < this.rows - 2) this._addBend(q, q + 2 * this.cols, this.rowY[j + 2] - this.rowY[j], this.vIdx[q], this.vIdx[q + this.cols]);
      }
    }
    // Cada restricción aguanta un poco más o un poco menos: el desgarro serpentea en vez de seguir la cuadrícula.
    var seed = 0x2545F491 >>> 0;
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    this.tearMul = new Float32Array(this.ca.length);
    for (var t = 0; t < this.tearMul.length; t++) this.tearMul[t] = this.kind[t] === KIND_PERF ? 0.92 + rnd() * 0.2 : 0.8 + rnd() * 0.4;
    // Lista de restricciones estructurales (sin cizalla ni flexión) de cada partícula, para ver qué sigue unido a las anillas.
    this.adj = [];
    for (var ai = 0; ai < n; ai++) this.adj.push([]);
    for (var ac = 0; ac < this.ca.length; ac++) {
      if (this.kind[ac] === KIND_SHEAR || this.kind[ac] === KIND_BEND) continue;
      this.adj[this.ca[ac]].push(ac); this.adj[this.cb[ac]].push(ac);
    }
    this.tip = new Uint8Array(n); this.tipPerf = new Uint8Array(n);
    this.tipWeak = o.tipWeak || 0.72;   // fracción del límite junto a un corte abierto
    this.hanging = n;     // partículas todavía unidas al borde superior
    this.detached = false;
    this.time = 0;
    this.broken = 0;
    this.lastBroken = -1;
    this.perfAlive = this.cols;
    this.kinetic = 0;
    this.flatness = 0;
    this.lift = 0;
    this.pointer = null;
  }

  Cloth.prototype._add = function (a, b, rest, kind) {
    this.ca.push(a); this.cb.push(b); this.rest.push(rest);
    this.kind.push(kind); this.alive.push(1); this.dep1.push(-1); this.dep2.push(-1);
  };
  Cloth.prototype._addBend = function (a, b, rest, d1, d2) {
    this._add(a, b, rest, KIND_BEND);
    this.dep1[this.dep1.length - 1] = d1; this.dep2[this.dep2.length - 1] = d2;
  };

  /** Celdas con sus cuatro lados intactos (1 = se dibuja). */
  Cloth.prototype.aliveQuads = function () {
    var cols = this.cols, rows = this.rows, out = new Uint8Array((cols - 1) * (rows - 1));
    var mapH = new Uint8Array(cols * rows), mapV = new Uint8Array(cols * rows);
    var len = this.ca.length;
    for (var c = 0; c < len; c++) {
      if (this.kind[c] === KIND_SHEAR || this.kind[c] === KIND_BEND) continue;
      var a = this.ca[c];
      if (this.cb[c] === a + 1) mapH[a] = this.alive[c]; else mapV[a] = this.alive[c];
    }
    for (var j = 0; j < rows - 1; j++) {
      for (var i = 0; i < cols - 1; i++) {
        var p = j * cols + i;
        out[j * (cols - 1) + i] = (mapH[p] && mapH[p + cols] && mapV[p] && mapV[p + 1]) ? 1 : 0;
      }
    }
    return out;
  };

  /** Sujeta las partículas cercanas al punto (gx, gy). */
  Cloth.prototype.grab = function (gx, gy, radius) {
    var best = -1, bd = Infinity, k;
    for (k = 0; k < this.n; k++) {
      var dx = this.x[k] - gx, dy = this.y[k] - gy, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = k; }
    }
    if (best < 0 || bd > radius * radius * 4) return false;
    var r2 = radius * radius, any = false;
    for (k = 0; k < this.n; k++) {
      var ex = this.x[k] - this.x[best], ey = this.y[k] - this.y[best];
      if (ex * ex + ey * ey <= r2 && !this.pinned[k]) {
        this.held[k] = 1;
        this.hx[k] = this.x[k] - gx;
        this.hy[k] = this.y[k] - gy;
        any = true;
      }
    }
    this.pointer = { x: gx, y: gy };
    this.start = { x: gx, y: gy };
    this.lift = 0;
    return any;
  };

  /** Mueve el puntero. Al tirar, la hoja se despega de la pared (z crece con el recorrido). */
  Cloth.prototype.move = function (gx, gy) {
    if (!this.pointer) return;
    this.pointer.x = gx; this.pointer.y = gy;
    var dx = gx - this.start.x, dy = gy - this.start.y;
    this.lift = Math.min(this.maxLift, Math.sqrt(dx * dx + dy * dy) * 0.6);
  };

  Cloth.prototype.drop = function () {
    this.held.fill(0);
    this.pointer = null;
  };

  Cloth.prototype.isHeld = function () { return !!this.pointer; };

  Cloth.prototype._solve = function () {
    var ca = this.ca, cb = this.cb, rest = this.rest, alive = this.alive, kind = this.kind;
    var x = this.x, y = this.y, z = this.z, pinned = this.pinned, held = this.held;
    var len = ca.length;
    for (var c = 0; c < len; c++) {
      if (!alive[c]) continue;
      var a = ca[c], b = cb[c];
      var dx = x[b] - x[a], dy = y[b] - y[a], dz = z[b] - z[a];
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      var diff = (d - rest[c]) / d;
      var wa = (pinned[a] || held[a]) ? 0 : 1;
      var wb = (pinned[b] || held[b]) ? 0 : 1;
      var w = wa + wb;
      if (w === 0) continue;
      var kk = kind[c], k = diff * (kk === KIND_SHEAR ? 0.5 : (kk === KIND_BEND ? this.bendStiff : 1)) / w;
      if (wa) { x[a] += dx * k; y[a] += dy * k; z[a] += dz * k; }
      if (wb) { x[b] -= dx * k; y[b] -= dy * k; z[b] -= dz * k; }
    }
  };

  Cloth.prototype._tear = function () {
    var ca = this.ca, cb = this.cb, rest = this.rest, alive = this.alive, kind = this.kind;
    var x = this.x, y = this.y, z = this.z, len = ca.length, perfAlive = 0, broken = 0, c;
    // Punta de grieta: junto a un corte ya abierto el papel cede con menos esfuerzo, así el rasgón sigue el tirón.
    var tip = this.tip, tipPerf = this.tipPerf;
    tip.fill(0); tipPerf.fill(0);
    for (c = 0; c < len; c++) {
      if (alive[c] || kind[c] === KIND_BEND || kind[c] === KIND_SHEAR) continue;
      if (kind[c] === KIND_PERF) { tipPerf[ca[c]] = 1; tipPerf[cb[c]] = 1; } else { tip[ca[c]] = 1; tip[cb[c]] = 1; }
    }
    for (c = 0; c < len; c++) {
      if (kind[c] === KIND_BEND) continue;
      if (!alive[c]) { broken++; continue; }
      var a = ca[c], b = cb[c];
      var dx = x[b] - x[a], dy = y[b] - y[a], dz = z[b] - z[a];
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // la línea de rasgado es muy fina: se mide el estiramiento en píxeles frente a una celda, no en proporción de su grosor
      var ratio = kind[c] === KIND_PERF ? 1 + (dist - rest[c]) / this.sy : dist / rest[c];
      var limit = kind[c] === KIND_PERF ? this.tearPerf : (kind[c] === KIND_SHEAR ? this.tearShear : this.tearBody);
      var weak = kind[c] === KIND_PERF ? (tipPerf[a] || tipPerf[b] ? 0.88 : 1) : (kind[c] === KIND_SHEAR ? 1 : (tip[a] || tip[b] ? this.tipWeak : 1));
      if (ratio > limit * this.tearMul[c] * weak) alive[c] = 0;
      if (kind[c] === KIND_PERF && alive[c]) perfAlive++;
    }
    // Qué sigue colgando de las anillas: recorrido desde la fila de arriba por las uniones que quedan enteras.
    if (broken !== this.lastBroken) {
      this.lastBroken = broken;
      var seen = new Uint8Array(this.n), stack = [], hang = 0, adj = this.adj, m, e, o2;
      for (m = 0; m < this.cols; m++) { seen[m] = 1; stack.push(m); }
      while (stack.length) {
        m = stack.pop(); hang++;
        for (e = 0; e < adj[m].length; e++) {
          c = adj[m][e];
          if (!alive[c]) continue;
          o2 = ca[c] === m ? cb[c] : ca[c];
          if (!seen[o2]) { seen[o2] = 1; stack.push(o2); }
        }
      }
      this.hanging = hang;
    }
    // Cuando solo queda una tira diminuta unida a las anillas (o una pestaña de la perforación), cede bajo el peso de la hoja.
    var tab = Math.max(1, Math.floor(this.cols * 0.15));
    if ((perfAlive > 0 && perfAlive <= tab) || this.hanging <= this.cols * 2.5) {
      for (c = 0; c < len; c++) if (kind[c] === KIND_PERF) alive[c] = 0;
      perfAlive = 0;
    }
    for (c = 0; c < len; c++) {
      if (kind[c] === KIND_BEND && alive[c] && (!alive[this.dep1[c]] || !alive[this.dep2[c]])) alive[c] = 0;
    }
    this.perfAlive = perfAlive;
    this.broken = broken;
    if (perfAlive === 0 && !this.detached) {
      this.detached = true;
      this.bendStiff = 0.4;   // suelta, el papel se vuelve flexible y ondea al caer
      for (var k = 0; k < this.cols; k++) this.pinned[k] = 0;
      // al separarse se inclina un poco hacia delante, girando sobre su borde superior
      for (var q = 0; q < this.n; q++) {
        var f = (this.y[q] - this.oy) / this.height;
        this.pz[q] = this.z[q] - 3.2 * f * f;
        this.px[q] = this.x[q] - 1.4 * f;
      }
    }
  };

  Cloth.prototype.step = function (dt) {
    dt = Math.min(dt, 1 / 30);
    var sub = this.substeps, h = dt / sub, g = this.gravity, damp = this.damping;
    var x = this.x, y = this.y, z = this.z, px = this.px, py = this.py, pz = this.pz;
    var pinned = this.pinned, held = this.held, ms = this.maxSpeed;
    for (var s = 0; s < sub; s++) {
      var k;
      for (k = 0; k < this.n; k++) {
        if (pinned[k]) continue;
        if (held[k] && this.pointer) {
          px[k] = x[k]; py[k] = y[k]; pz[k] = z[k];
          x[k] = this.pointer.x + this.hx[k];
          y[k] = this.pointer.y + this.hy[k];
          z[k] = this.lift;
          continue;
        }
        var vx = (x[k] - px[k]) * damp, vy = (y[k] - py[k]) * damp, vz = (z[k] - pz[k]) * damp;
        var sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (sp > ms) { var r = ms / sp; vx *= r; vy *= r; vz *= r; }
        px[k] = x[k]; py[k] = y[k]; pz[k] = z[k];
        x[k] += vx; y[k] += vy + g * h * h; z[k] += vz - (this.detached ? 0 : g * h * h * 0.45);   // lo levantado vuelve a caer hacia la pared
      }
      for (var it = 0; it < this.iterations; it++) this._solve();
      // la pared: nada atraviesa z = 0 (y la hoja pierde velocidad hacia atrás al apoyarse)
      for (k = 0; k < this.n; k++) {
        if (z[k] < 0) { z[k] = 0; pz[k] = 0; }
      }
    }
    this._tear();
    var kin = 0, mz = 0, dev = 0;
    for (var q = 0; q < this.n; q++) {
      var ddx = x[q] - px[q], ddy = y[q] - py[q], ddz = z[q] - pz[q], m2 = ddx * ddx + ddy * ddy + ddz * ddz;
      if (m2 > kin) kin = m2;
      if (z[q] > mz) mz = z[q];
      var ex = Math.abs(x[q] - (this.ox + (q % this.cols) * this.sx)), ey = Math.abs(y[q] - (this.oy + this.rowY[Math.floor(q / this.cols)]));
      if (ex > dev) dev = ex;
      if (ey > dev) dev = ey;
    }
    this.kinetic = Math.sqrt(kin);
    this.flatness = Math.max(mz, dev);   // distancia máxima a su posición plana de reposo
    this.time += dt;
  };

  /** Rotura asistida (teclado / movimiento reducido). */
  Cloth.prototype.autoTear = function () {
    var len = this.ca.length;
    for (var c = 0; c < len; c++) if (this.kind[c] === KIND_PERF) this.alive[c] = 0;
    this._tear();
  };

  /** ¿Está quieta e intacta? (se puede dibujar plana) */
  Cloth.prototype.isSettled = function () {
    return !this.pointer && !this.detached && this.broken === 0 && this.kinetic < 0.04 && this.flatness < 1 && this.time > 0.4;
  };

  Cloth.prototype.bounds = function () {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var k = 0; k < this.n; k++) {
      if (this.x[k] < minX) minX = this.x[k];
      if (this.x[k] > maxX) maxX = this.x[k];
      if (this.y[k] < minY) minY = this.y[k];
      if (this.y[k] > maxY) maxY = this.y[k];
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  };

  /** Normales por vértice (diferencias finitas). Plana ⇒ (0, 0, 1). Escribe en out (3 floats por vértice). */
  Cloth.prototype.normals = function (out, foldOut) {
    var cols = this.cols, rows = this.rows, x = this.x, y = this.y, z = this.z;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        var k = j * cols + i;
        var l = j * cols + Math.max(0, i - 1), r = j * cols + Math.min(cols - 1, i + 1);
        var u = Math.max(0, j - 1) * cols + i, d = Math.min(rows - 1, j + 1) * cols + i;
        var tx = x[r] - x[l], ty = y[r] - y[l], tz = z[r] - z[l];
        var bx = x[d] - x[u], by = y[d] - y[u], bz = z[d] - z[u];
        var nx = ty * bz - tz * by, ny = tz * bx - tx * bz, nz = tx * by - ty * bx;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        out[k * 3] = nx / len; out[k * 3 + 1] = ny / len; out[k * 3 + 2] = nz / len;
      }
    }
    if (foldOut) {
      // curvatura: cuánto se separa la normal de cada vértice de la de sus vecinos (0 = plana, 1 = pliegue marcado)
      for (j = 0; j < rows; j++) {
        for (i = 0; i < cols; i++) {
          var v = j * cols + i, m = 1;
          var nb = [j * cols + Math.max(0, i - 1), j * cols + Math.min(cols - 1, i + 1), Math.max(0, j - 1) * cols + i, Math.min(rows - 1, j + 1) * cols + i];
          for (var q = 0; q < 4; q++) {
            var w = nb[q];
            var dot = out[v * 3] * out[w * 3] + out[v * 3 + 1] * out[w * 3 + 1] + out[v * 3 + 2] * out[w * 3 + 2];
            if (dot < m) m = dot;
          }
          foldOut[v] = 1 - Math.max(-1, Math.min(1, m));
        }
      }
    }
    return out;
  };

  var api = { Cloth: Cloth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TyelCloth = api;
})(typeof self !== 'undefined' ? self : this);
