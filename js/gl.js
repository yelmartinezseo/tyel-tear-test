/*!
 * T-Yel · dibujo en WebGL (perspectiva, luz y sombra) de la hoja simulada
 * © 2026 Yel Martínez — https://yel-martinez-portfolio.com
 * SPDX-License-Identifier: MIT
 *
 * Código propio, sin librerías. La malla de la tela se sube a la GPU en cada fotograma
 * junto con sus normales; el sombreador aplica una cámara con perspectiva, luz difusa y
 * un brillo suave, pinta el reverso de la hoja como papel blanco y proyecta su sombra
 * sobre la hoja de debajo.
 */
(function (root) {
  'use strict';

  var VERT = [
    'attribute vec3 aPos; attribute vec2 aUv; attribute vec3 aNor; attribute vec3 aEx; attribute vec2 aCell;',
    'uniform vec2 uRes; uniform vec2 uCenter; uniform float uDist;',
    'varying vec2 vUv; varying vec3 vNor; varying vec3 vEx; varying vec2 vCell;',
    'void main(){',
    '  float s = uDist / (uDist - aPos.z);',
    '  vec2 p = uCenter + (aPos.xy - uCenter) * s;',
    '  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, -aPos.z / 4000.0, 1.0);',
    '  vUv = aUv; vNor = aNor; vEx = aEx; vCell = aCell;',
    '}'
  ].join('\n');

  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D uTex; uniform sampler2D uField; uniform float uAlpha; uniform float uMode; uniform float uUseField; uniform vec2 uNoise;',
    'varying vec2 vUv; varying vec3 vNor; varying vec3 vEx; varying vec2 vCell;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    'void main(){',
    '  float edge = 0.0;',
    '  if (uUseField > 0.5) {',                  // contorno suave de lo que sigue entero: un corte en diagonal no sale en escalera
    '    float f = texture2D(uField, vCell).r;',
    '    vec2 p = vUv * uNoise;',
    '    float nz = 0.45 * vnoise(p) + 0.3 * vnoise(p * 2.7 + 7.3) + 0.25 * vnoise(p * 7.9 + 3.1);',   // grueso, medio y fibra fina
    '    float th = 0.5 + 0.3 * nz;',            // el borde se desgasta de forma irregular, igual en cada fotograma
    '    if (f < th) discard;',
    '    edge = 1.0 - smoothstep(th, th + 0.14, f);',
    '  }',
    '  if (uMode > 0.5) {',                       // sombra: la altura viaja en la normal
    '    float a = 0.30 * (1.0 - clamp(vNor.z / 320.0, 0.0, 1.0));',
    '    gl_FragColor = vec4(0.0, 0.0, 0.0, a * uAlpha); return;',
    '  }',
    '  vec3 n = length(vNor) > 0.0001 ? normalize(vNor) : vec3(0.0, 0.0, 1.0);',   // un trozo diminuto puede tener la normal a cero
    '  vec4 c = texture2D(uTex, vUv);',
    '  vec3 col = c.rgb;',
    '  if (!gl_FrontFacing) {',                   // reverso: papel casi blanco con la tinta apenas translúcida
    '    n = -n;',
    '    vec3 ink = texture2D(uTex, vec2(1.0 - vUv.x, vUv.y)).rgb;',
    '    col = mix(vec3(0.955, 0.945, 0.915), ink, 0.09);',
    '  }',
    '  vec3 L = normalize(vec3(-0.35, -0.55, 0.75));',
    '  float d = clamp(dot(n, L), -0.3, 1.0);',
    '  float light = 0.80 + 0.22 * d;',            // difuso suave: el papel es mate y fino
    '  light *= 1.0 - 0.16 * clamp(vEx.x * 2.0, 0.0, 1.0);',   // ligera oclusión en los pliegues
    '  col = mix(col, vec3(0.97, 0.955, 0.93), edge * 0.7);',  // filo claro y fino de la fibra
    '  vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));',
    '  float sheen = pow(max(dot(n, h), 0.0), 9.0) * 0.025;',
    '  gl_FragColor = vec4(col * light + sheen, c.a * uAlpha);',
    '}'
  ].join('\n');

  function shader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function TyelGL(canvas) {
    var gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false }) ||
             canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('Sin WebGL');
    this.gl = gl; this.canvas = canvas;
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.prog = p;
    this.loc = {
      pos: gl.getAttribLocation(p, 'aPos'), uv: gl.getAttribLocation(p, 'aUv'), nor: gl.getAttribLocation(p, 'aNor'), ex: gl.getAttribLocation(p, 'aEx'), cell: gl.getAttribLocation(p, 'aCell'),
      res: gl.getUniformLocation(p, 'uRes'), center: gl.getUniformLocation(p, 'uCenter'), dist: gl.getUniformLocation(p, 'uDist'),
      tex: gl.getUniformLocation(p, 'uTex'), alpha: gl.getUniformLocation(p, 'uAlpha'), mode: gl.getUniformLocation(p, 'uMode'), noise: gl.getUniformLocation(p, 'uNoise'), field: gl.getUniformLocation(p, 'uField'), useField: gl.getUniformLocation(p, 'uUseField')
    };
    this.bPos = gl.createBuffer(); this.bUv = gl.createBuffer(); this.bNor = gl.createBuffer(); this.bEx = gl.createBuffer(); this.bCell = gl.createBuffer(); this.fieldTex = gl.createTexture(); this.bIdx = gl.createBuffer();
    this.meshKey = ''; this.nors = null; this.poss = null; this.sPos = null; this.sNor = null;
    this.w = 1; this.h = 1; this.dist = 1500;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LEQUAL);
    // en pantalla la y crece hacia abajo, así que el sentido de giro visto desde delante es horario
    gl.frontFace(gl.CW);
  }

  /** w, h en píxeles CSS; la resolución real la fija el canvas (ya escalado por dpr). */
  TyelGL.prototype.resize = function (w, h) {
    this.w = w; this.h = h;
    this.dist = Math.max(w, h) * 1.2;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.uniform2f(this.loc.res, w, h);
    this.gl.uniform2f(this.loc.center, w / 2, h * 0.4);
    this.gl.uniform1f(this.loc.dist, this.dist);
    this.gl.uniform2f(this.loc.noise, w / 6, h / 6); // el desgaste del borde rasgado varía cada ~6 px
  };

  TyelGL.prototype.center = function () { return { x: this.w / 2, y: this.h * 0.4 }; };

  TyelGL.prototype.texture = function (canvas) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  TyelGL.prototype.free = function (t) { if (t) this.gl.deleteTexture(t); };

  TyelGL.prototype.begin = function () {
    var gl = this.gl;
    gl.clearColor(0.05, 0.045, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };

  TyelGL.prototype._bindAttr = function (buf, loc, size, data, usage) {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };

  /** Hoja plana a pantalla completa (z = 0). */
  TyelGL.prototype.drawFlat = function (tex, rect, alpha) {
    var gl = this.gl, L = this.loc;
    var x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.w, y1 = rect.y + rect.h;
    var pos = new Float32Array([x0, y0, 0, x1, y0, 0, x0, y1, 0, x1, y1, 0]);
    var uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    var nor = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    this._bindAttr(this.bPos, L.pos, 3, pos); this._bindAttr(this.bUv, L.uv, 2, uv); this._bindAttr(this.bNor, L.nor, 3, nor);
    this._bindAttr(this.bEx, L.ex, 3, new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]));
    this._bindAttr(this.bCell, L.cell, 2, new Float32Array(8));
    gl.uniform1f(L.mode, 0); gl.uniform1f(L.useField, 0); gl.uniform1f(L.alpha, alpha == null ? 1 : alpha);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(L.tex, 0);
    gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  TyelGL.prototype._mesh = function (cloth) {
    var key = cloth.cols + 'x' + cloth.rows;
    if (key === this.meshKey) return;
    this.meshKey = key;
    var n = cloth.n, i, j;
    this.poss = new Float32Array(n * 3); this.nors = new Float32Array(n * 3);
    this.sPos = new Float32Array(n * 3); this.sNor = new Float32Array(n * 3);
    this.fold = new Float32Array(n); this.ex = new Float32Array(n * 3); this.zeroEx = new Float32Array(n * 3).fill(1);
    var uv = new Float32Array(n * 2);
    for (j = 0; j < cloth.rows; j++) for (i = 0; i < cloth.cols; i++) {
      var k = j * cloth.cols + i;
      uv[k * 2] = i / (cloth.cols - 1); uv[k * 2 + 1] = cloth.rowV[j];
    }
    this.uvData = uv;
    var cell = new Float32Array(n * 2);
    for (j = 0; j < cloth.rows; j++) for (i = 0; i < cloth.cols; i++) {
      var kk = j * cloth.cols + i;
      cell[kk * 2] = i / (cloth.cols - 1); cell[kk * 2 + 1] = j / (cloth.rows - 1);
    }
    this.cellData = cell;
    this.fieldBytes = new Uint8Array((cloth.cols - 1) * (cloth.rows - 1));
    this.idxBuf = new Uint16Array((cloth.cols - 1) * (cloth.rows - 1) * 6);
  };

  TyelGL.prototype._indices = function (cloth) {
    var alive = cloth.aliveQuads(), cols = cloth.cols, rows = cloth.rows, idx = this.idxBuf, c = 0;
    this._alive = alive;
    for (var j = 0; j < rows - 1; j++) for (var i = 0; i < cols - 1; i++) {
      if (!alive[j * (cols - 1) + i]) continue;
      var a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
      idx[c++] = a; idx[c++] = b; idx[c++] = d; idx[c++] = b; idx[c++] = e; idx[c++] = d;
    }
    return c;
  };

  /** Mapa de celdas enteras (1) y rotas (0) en la unidad de textura 1; el sombreador lo suaviza para dibujar el contorno. */
  TyelGL.prototype._field = function (cloth, alive) {
    var gl = this.gl, b = this.fieldBytes, k;
    for (k = 0; k < b.length; k++) b[k] = alive[k] ? 255 : 0;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cloth.cols - 1, cloth.rows - 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, b);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.loc.field, 1);
    gl.activeTexture(gl.TEXTURE0);
    this._bindAttr(this.bCell, this.loc.cell, 2, this.cellData);
    gl.uniform1f(this.loc.useField, 1);
  };

  /** Sombra de la hoja sobre la hoja de debajo: tres pasadas con distinta apertura imitan el desenfoque. */
  TyelGL.prototype.drawShadow = function (cloth, alpha) {
    var gl = this.gl, L = this.loc;
    this._mesh(cloth);
    var count = this._indices(cloth);
    if (!count) return;
    var n = cloth.n, sp = this.sPos, sn = this.sNor;
    var spreads = [1.0, 1.35, 1.8], weights = [0.55, 0.32, 0.22];
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf.subarray(0, count), gl.DYNAMIC_DRAW);
    this._field(cloth, this._alive);
    gl.uniform1f(L.mode, 1);
    gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
    for (var pass = 0; pass < 3; pass++) {
      for (var k = 0; k < n; k++) {
        var z = cloth.z[k], sc = spreads[pass];
        sp[k * 3] = cloth.x[k] + 0.47 * z * sc; sp[k * 3 + 1] = cloth.y[k] + 0.73 * z * sc; sp[k * 3 + 2] = 0;
        sn[k * 3] = 0; sn[k * 3 + 1] = 0; sn[k * 3 + 2] = z;
      }
      this._bindAttr(this.bPos, L.pos, 3, sp); this._bindAttr(this.bUv, L.uv, 2, this.uvData);
      this._bindAttr(this.bNor, L.nor, 3, sn); this._bindAttr(this.bEx, L.ex, 3, this.zeroEx);
      gl.uniform1f(L.alpha, (alpha == null ? 1 : alpha) * weights[pass]);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    }
  };

  /** La tela, con perspectiva, luz y reverso. */
  TyelGL.prototype.drawCloth = function (cloth, tex, alpha) {
    var gl = this.gl, L = this.loc;
    this._mesh(cloth);
    var n = cloth.n, pos = this.poss;
    for (var k = 0; k < n; k++) { pos[k * 3] = cloth.x[k]; pos[k * 3 + 1] = cloth.y[k]; pos[k * 3 + 2] = cloth.z[k]; }
    cloth.normals(this.nors, this.fold);
    var count = this._indices(cloth);
    if (!count) return;
    // x = pliegue (curvatura)
    var ex = this.ex, q;
    for (q = 0; q < n; q++) { ex[q * 3] = this.fold[q]; ex[q * 3 + 1] = 0; ex[q * 3 + 2] = 1; }
    this._field(cloth, this._alive);
    this._bindAttr(this.bPos, L.pos, 3, pos); this._bindAttr(this.bUv, L.uv, 2, this.uvData); this._bindAttr(this.bNor, L.nor, 3, this.nors);
    this._bindAttr(this.bEx, L.ex, 3, ex);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf.subarray(0, count), gl.DYNAMIC_DRAW);
    gl.uniform1f(L.mode, 0); gl.uniform1f(L.alpha, alpha == null ? 1 : alpha);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(L.tex, 0);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  };

  var api = { TyelGL: TyelGL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TyelGLLib = api;
})(typeof self !== 'undefined' ? self : this);
