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

  var KIND_H = 0, KIND_V = 1, KIND_SHEAR = 2, KIND_PERF = 3;

  function Cloth(o) {
    o = o || {};
    this.cols = o.cols || 16;
    this.rows = o.rows || 20;
    this.width = o.width || 400;
    this.height = o.height || 500;
    this.ox = o.x || 0;
    this.oy = o.y || 0;
    this.gravity = o.gravity != null ? o.gravity : this.height * 4.8;
    this.damping = o.damping != null ? o.damping : 0.992;
    this.iterations = o.iterations || 10;
    this.substeps = o.substeps || 2;
    this.tearBody = o.tearBody || 2.4;   // razón de estiramiento que rompe el cuerpo de la hoja
    this.tearPerf = o.tearPerf || 1.18;  // ídem para la perforación (más débil: se rasga con un tirón corto)
    this.tearShear = o.tearShear || 2.8;

    var n = this.cols * this.rows;
    this.n = n;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.pinned = new Uint8Array(n);
    this.held = new Uint8Array(n);
    this.hx = new Float32Array(n); this.hy = new Float32Array(n); // desplazamiento respecto al puntero

    var sx = this.width / (this.cols - 1);
    var sy = this.height / (this.rows - 1);
    this.sx = sx; this.sy = sy;
    this.maxSpeed = o.maxSpeed || Math.max(sx, sy) * 0.9; // px por subpaso
    this.maxLift = o.maxLift || Math.min(this.width, this.height) * 0.5;

    var i, j;
    for (j = 0; j < this.rows; j++) {
      for (i = 0; i < this.cols; i++) {
        var k = j * this.cols + i;
        this.x[k] = this.px[k] = this.ox + i * sx;
        this.y[k] = this.py[k] = this.oy + j * sy;
        this.z[k] = this.pz[k] = 0;
      }
    }
    if (o.pinTop !== false) for (i = 0; i < this.cols; i++) this.pinned[i] = 1;

    this.ca = []; this.cb = []; this.rest = []; this.kind = []; this.alive = [];
    for (j = 0; j < this.rows; j++) {
      for (i = 0; i < this.cols; i++) {
        var a = j * this.cols + i;
        if (i < this.cols - 1) this._add(a, a + 1, sx, KIND_H);
        if (j < this.rows - 1) this._add(a, a + this.cols, sy, j === 0 ? KIND_PERF : KIND_V);
        if (i < this.cols - 1 && j < this.rows - 1) {
          var d = Math.sqrt(sx * sx + sy * sy);
          this._add(a, a + this.cols + 1, d, KIND_SHEAR);
          this._add(a + 1, a + this.cols, d, KIND_SHEAR);
        }
      }
    }
    this.detached = false;
    this.time = 0;
    this.broken = 0;
    this.perfAlive = this.cols;
    this.kinetic = 0;
    this.lift = 0;
    this.pointer = null;
  }

  Cloth.prototype._add = function (a, b, rest, kind) {
    this.ca.push(a); this.cb.push(b); this.rest.push(rest);
    this.kind.push(kind); this.alive.push(1);
  };

  /** Celdas con sus cuatro lados intactos (1 = se dibuja). */
  Cloth.prototype.aliveQuads = function () {
    var cols = this.cols, rows = this.rows, out = new Uint8Array((cols - 1) * (rows - 1));
    var mapH = new Uint8Array(cols * rows), mapV = new Uint8Array(cols * rows);
    var len = this.ca.length;
    for (var c = 0; c < len; c++) {
      if (this.kind[c] === KIND_SHEAR) continue;
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
      var k = diff * (kind[c] === KIND_SHEAR ? 0.5 : 1) / w;
      if (wa) { x[a] += dx * k; y[a] += dy * k; z[a] += dz * k; }
      if (wb) { x[b] -= dx * k; y[b] -= dy * k; z[b] -= dz * k; }
    }
  };

  Cloth.prototype._tear = function () {
    var ca = this.ca, cb = this.cb, rest = this.rest, alive = this.alive, kind = this.kind;
    var x = this.x, y = this.y, z = this.z, len = ca.length, perfAlive = 0, broken = 0, c;
    for (c = 0; c < len; c++) {
      if (!alive[c]) { broken++; continue; }
      var a = ca[c], b = cb[c];
      var dx = x[b] - x[a], dy = y[b] - y[a], dz = z[b] - z[a];
      var ratio = Math.sqrt(dx * dx + dy * dy + dz * dz) / rest[c];
      var limit = kind[c] === KIND_PERF ? this.tearPerf : (kind[c] === KIND_SHEAR ? this.tearShear : this.tearBody);
      if (ratio > limit) alive[c] = 0;
      if (kind[c] === KIND_PERF && alive[c]) perfAlive++;
    }
    // Cuando queda solo una pestaña diminuta unida a las anillas, cede bajo el peso de la hoja.
    var tab = Math.max(1, Math.floor(this.cols * 0.15));
    if (perfAlive > 0 && perfAlive <= tab) {
      for (c = 0; c < len; c++) if (kind[c] === KIND_PERF) alive[c] = 0;
      perfAlive = 0;
    }
    this.perfAlive = perfAlive;
    this.broken = broken;
    if (perfAlive === 0 && !this.detached) {
      this.detached = true;
      for (var k = 0; k < this.cols; k++) this.pinned[k] = 0;
      // al separarse se inclina un poco hacia delante, girando sobre su borde superior
      for (var q = 0; q < this.n; q++) {
        var f = (this.y[q] - this.oy) / this.height;
        this.pz[q] = this.z[q] - 2.2 * f * f;
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
        x[k] += vx; y[k] += vy + g * h * h; z[k] += vz;
      }
      for (var it = 0; it < this.iterations; it++) this._solve();
      // la pared: nada atraviesa z = 0 (y la hoja pierde velocidad hacia atrás al apoyarse)
      for (k = 0; k < this.n; k++) {
        if (z[k] < 0) { z[k] = 0; pz[k] = 0; }
      }
    }
    this._tear();
    var kin = 0;
    for (var q = 0; q < this.n; q++) {
      var ddx = x[q] - px[q], ddy = y[q] - py[q], ddz = z[q] - pz[q], m2 = ddx * ddx + ddy * ddy + ddz * ddz;
      if (m2 > kin) kin = m2;
    }
    this.kinetic = Math.sqrt(kin);
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
    return !this.pointer && !this.detached && this.broken === 0 && this.kinetic < 0.04 && this.time > 0.4;
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
  Cloth.prototype.normals = function (out) {
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
    return out;
  };

  var api = { Cloth: Cloth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TyelCloth = api;
})(typeof self !== 'undefined' ? self : this);
