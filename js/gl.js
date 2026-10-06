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
    'attribute vec3 aPos; attribute vec2 aUv; attribute vec3 aNor;',
    'uniform vec2 uRes; uniform vec2 uCenter; uniform float uDist;',
    'varying vec2 vUv; varying vec3 vNor;',
    'void main(){',
    '  float s = uDist / (uDist - aPos.z);',
    '  vec2 p = uCenter + (aPos.xy - uCenter) * s;',
    '  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, -aPos.z / 4000.0, 1.0);',
    '  vUv = aUv; vNor = aNor;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'uniform sampler2D uTex; uniform float uAlpha; uniform float uMode;',
    'varying vec2 vUv; varying vec3 vNor;',
    'void main(){',
    '  if (uMode > 0.5) {',                       // sombra: la altura viaja en la normal
    '    float a = 0.34 * (1.0 - clamp(vNor.z / 300.0, 0.0, 1.0));',
    '    gl_FragColor = vec4(0.0, 0.0, 0.0, a * uAlpha); return;',
    '  }',
    '  vec3 n = normalize(vNor);',
    '  vec4 c = texture2D(uTex, vUv);',
    '  vec3 col = c.rgb;',
    '  if (!gl_FrontFacing) { n = -n; col = mix(vec3(0.96, 0.95, 0.93), c.rgb, 0.08); }',
    '  vec3 L = normalize(vec3(-0.35, -0.55, 0.75));',
    '  float d = max(dot(n, L), 0.0);',
    '  float light = 0.64 + 0.42 * d;',
    '  vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));',
    '  float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.10;',
    '  gl_FragColor = vec4(col * light + spec, c.a * uAlpha);',
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
      pos: gl.getAttribLocation(p, 'aPos'), uv: gl.getAttribLocation(p, 'aUv'), nor: gl.getAttribLocation(p, 'aNor'),
      res: gl.getUniformLocation(p, 'uRes'), center: gl.getUniformLocation(p, 'uCenter'), dist: gl.getUniformLocation(p, 'uDist'),
      tex: gl.getUniformLocation(p, 'uTex'), alpha: gl.getUniformLocation(p, 'uAlpha'), mode: gl.getUniformLocation(p, 'uMode')
    };
    this.bPos = gl.createBuffer(); this.bUv = gl.createBuffer(); this.bNor = gl.createBuffer(); this.bIdx = gl.createBuffer();
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
    gl.uniform1f(L.mode, 0); gl.uniform1f(L.alpha, alpha == null ? 1 : alpha);
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
    var uv = new Float32Array(n * 2);
    for (j = 0; j < cloth.rows; j++) for (i = 0; i < cloth.cols; i++) {
      var k = j * cloth.cols + i;
      uv[k * 2] = i / (cloth.cols - 1); uv[k * 2 + 1] = j / (cloth.rows - 1);
    }
    this.uvData = uv;
    this.idxBuf = new Uint16Array((cloth.cols - 1) * (cloth.rows - 1) * 6);
  };

  TyelGL.prototype._indices = function (cloth) {
    var alive = cloth.aliveQuads(), cols = cloth.cols, rows = cloth.rows, idx = this.idxBuf, c = 0;
    for (var j = 0; j < rows - 1; j++) for (var i = 0; i < cols - 1; i++) {
      if (!alive[j * (cols - 1) + i]) continue;
      var a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
      idx[c++] = a; idx[c++] = b; idx[c++] = d; idx[c++] = b; idx[c++] = e; idx[c++] = d;
    }
    return c;
  };

  /** Sombra de la hoja sobre la hoja de debajo (proyectada sobre z = 0). */
  TyelGL.prototype.drawShadow = function (cloth, alpha) {
    var gl = this.gl, L = this.loc;
    this._mesh(cloth);
    var n = cloth.n, sp = this.sPos, sn = this.sNor;
    for (var k = 0; k < n; k++) {
      var z = cloth.z[k];
      sp[k * 3] = cloth.x[k] + 0.47 * z; sp[k * 3 + 1] = cloth.y[k] + 0.73 * z; sp[k * 3 + 2] = 0;
      sn[k * 3] = 0; sn[k * 3 + 1] = 0; sn[k * 3 + 2] = z;
    }
    var count = this._indices(cloth);
    if (!count) return;
    this._bindAttr(this.bPos, L.pos, 3, sp); this._bindAttr(this.bUv, L.uv, 2, this.uvData); this._bindAttr(this.bNor, L.nor, 3, sn);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf.subarray(0, count), gl.DYNAMIC_DRAW);
    gl.uniform1f(L.mode, 1); gl.uniform1f(L.alpha, alpha == null ? 1 : alpha);
    gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  };

  /** La tela, con perspectiva, luz y reverso. */
  TyelGL.prototype.drawCloth = function (cloth, tex, alpha) {
    var gl = this.gl, L = this.loc;
    this._mesh(cloth);
    var n = cloth.n, pos = this.poss;
    for (var k = 0; k < n; k++) { pos[k * 3] = cloth.x[k]; pos[k * 3 + 1] = cloth.y[k]; pos[k * 3 + 2] = cloth.z[k]; }
    cloth.normals(this.nors);
    var count = this._indices(cloth);
    if (!count) return;
    this._bindAttr(this.bPos, L.pos, 3, pos); this._bindAttr(this.bUv, L.uv, 2, this.uvData); this._bindAttr(this.bNor, L.nor, 3, this.nors);
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
