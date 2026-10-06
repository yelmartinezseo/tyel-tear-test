// Pruebas de la simulación de tela. Ejecutar con:  node test/cloth.test.js
'use strict';
const { Cloth } = require('../js/cloth.js');

let failed = 0;
function ok(cond, msg) {
  console.log((cond ? '  ✔ ' : '  ✘ ') + msg);
  if (!cond) failed++;
}
function make() {
  return new Cloth({ cols: 14, rows: 18, width: 400, height: 500, x: 100, y: 60 });
}
function finite(c) {
  for (let k = 0; k < c.n; k++) if (!isFinite(c.x[k]) || !isFinite(c.y[k]) || !isFinite(c.z[k])) return false;
  return true;
}
function maxZ(c) { let m = 0; for (let k = 0; k < c.n; k++) if (c.z[k] > m) m = c.z[k]; return m; }
function minZ(c) { let m = Infinity; for (let k = 0; k < c.n; k++) if (c.z[k] < m) m = c.z[k]; return m; }
const DT = 1 / 60;

console.log('1) Colgada, sin tocar');
{
  const c = make();
  for (let i = 0; i < 600; i++) c.step(DT);
  const b = c.bounds();
  ok(finite(c), 'sin valores NaN ni infinitos');
  ok(!c.detached, 'no se desprende sola');
  ok(c.perfAlive === c.cols, 'perforación intacta (' + c.perfAlive + '/' + c.cols + ')');
  ok(b.maxY - (60 + 500) < 30, 'estiramiento por su propio peso < 30 px (' + (b.maxY - 560).toFixed(1) + ')');
}

function pull(label, fromX, fromY, toX, toY, frames, hold) {
  const c = make();
  for (let i = 0; i < 30; i++) c.step(DT);
  const grabbed = c.grab(fromX, fromY, 45);
  const log = [];
  for (let f = 1; f <= frames; f++) {
    const t = f / frames;
    c.move(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t);
    c.step(DT);
    if (f % 10 === 0) log.push(f + ':' + c.perfAlive);
  }
  for (let f = 0; f < hold; f++) c.step(DT);
  return { c, grabbed, log };
}

console.log('2) Tirar desde la esquina inferior izquierda hacia abajo y a la derecha');
{
  const r = pull('esquina', 120, 540, 470, 940, 70, 30);
  ok(r.grabbed, 'agarra la hoja');
  ok(finite(r.c), 'sin NaN');
  console.log('     perforación viva por fotograma: ' + r.log.join('  '));
  ok(r.c.detached, 'la hoja se desprende');
}

console.log('3) Tirar del centro hacia abajo');
{
  const r = pull('centro', 300, 300, 300, 800, 70, 30);
  ok(r.grabbed, 'agarra la hoja');
  ok(finite(r.c), 'sin NaN');
  console.log('     perforación viva por fotograma: ' + r.log.join('  '));
  ok(r.c.detached, 'la hoja se desprende');
}

console.log('4) Tirón corto y suelta (no debe desprenderse)');
{
  const r = pull('corto', 300, 400, 300, 450, 20, 90);
  ok(finite(r.c), 'sin NaN');
  ok(!r.c.detached, 'sigue anclada (' + r.c.perfAlive + '/' + r.c.cols + ')');
}

console.log('5) Una vez desprendida cae y no vuelve a anclarse');
{
  const r = pull('caida', 120, 540, 470, 940, 70, 0);
  const c = r.c;
  c.drop();
  for (let i = 0; i < 240; i++) c.step(DT);
  const b = c.bounds();
  ok(c.detached && b.minY > 400, 'cae por debajo de la zona de anillas (minY=' + b.minY.toFixed(0) + ')');
}

console.log('6) Rotura asistida');
{
  const c = make();
  c.autoTear();
  for (let i = 0; i < 120; i++) c.step(DT);
  ok(c.detached && finite(c), 'se desprende y es estable');
}

console.log('7) Profundidad y normales');
{
  const flat = make();
  const nor = flat.normals(new Float32Array(flat.n * 3));
  let okFlat = true;
  for (let k = 0; k < flat.n; k++) if (Math.abs(nor[k * 3]) > 1e-6 || Math.abs(nor[k * 3 + 1]) > 1e-6 || Math.abs(nor[k * 3 + 2] - 1) > 1e-6) okFlat = false;
  ok(okFlat, 'hoja plana: todas las normales apuntan a (0, 0, 1)');
  const r = pull('despegue', 300, 540, 330, 640, 40, 0);
  ok(maxZ(r.c) > 20, 'al tirar se despega de la pared (z máx = ' + maxZ(r.c).toFixed(0) + ')');
  ok(minZ(r.c) >= 0, 'nunca atraviesa la pared (z mín = ' + minZ(r.c).toFixed(2) + ')');
  const rest = make();
  for (let i = 0; i < 300; i++) rest.step(DT);
  ok(maxZ(rest) < 1, 'colgada en reposo, sigue pegada a la pared (z máx = ' + maxZ(rest).toFixed(3) + ')');
}

console.log(failed ? '\n' + failed + ' prueba(s) fallida(s)' : '\nTodas las pruebas correctas');
process.exit(failed ? 1 : 0);
