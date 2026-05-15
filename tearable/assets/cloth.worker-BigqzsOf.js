(function() {
    "use strict";
    const H = (async () => {
        const r = new URL("../cloth-sim.wasm",self.location.href).toString()
          , e = await fetch(r);
        if (!e.ok)
            throw new Error(`Failed to fetch cloth-sim.wasm: ${e.status}`);
        if (WebAssembly.compileStreaming)
            return WebAssembly.compileStreaming(e);
        const t = await e.arrayBuffer();
        return WebAssembly.compile(t)
    }
    )()
      , P = new Map
      , D = [];
    let J = !1;
    H.then( () => {
        J = !0;
        for (const {id: r, msg: e} of D)
            K(r, e);
        D.length = 0
    }
    ).catch(r => {
        console.error("[cloth.worker] WASM compile failed", r)
    }
    );
    async function Y(r, e, t, a, i, y) {
        const o = await H
          , c = (await WebAssembly.instantiate(o, {})).exports;
        c.init(r, e, t, a, i, y);
        const m = c.pos_ptr()
          , l = c.pos_len()
          , s = new Float32Array(c.memory.buffer,m,l)
          , n = c.particle_count()
          , b = r / t * i;
        return {
            exports: c,
            posView: s,
            pendingMessages: [],
            segX: t,
            segY: a,
            width: r,
            particleCount: n,
            maxLengthSq: b * b,
            normalsBuf: new Float32Array(n * 3),
            indexBuf: new Uint32Array(t * a * 6)
        }
    }
    function Z(r) {
        const {posView: e, segX: t, segY: a, particleCount: i, maxLengthSq: y, normalsBuf: o, indexBuf: u} = r
          , c = t + 1
          , m = i * 3;
        for (let s = 0; s < m; s++)
            o[s] = 0;
        let l = 0;
        for (let s = 0; s < a; s++)
            for (let n = 0; n < t; n++) {
                const _ = n + c * s
                  , b = n + c * (s + 1)
                  , k = n + 1 + c * (s + 1)
                  , S = n + 1 + c * s
                  , d = _ * 3
                  , w = b * 3
                  , v = k * 3
                  , h = S * 3
                  , U = e[d]
                  , E = e[d + 1]
                  , G = e[d + 2]
                  , L = e[w]
                  , M = e[w + 1]
                  , F = e[w + 2]
                  , N = e[v]
                  , Q = e[v + 1]
                  , j = e[v + 2]
                  , R = e[h]
                  , I = e[h + 1]
                  , O = e[h + 2];
                let f = U - L
                  , p = E - M
                  , x = G - F;
                const X = f * f + p * p + x * x;
                f = U - R,
                p = E - I,
                x = G - O;
                const ee = f * f + p * p + x * x;
                if (X < y && ee < y) {
                    u[l++] = _,
                    u[l++] = b,
                    u[l++] = S;
                    const q = L - U
                      , $ = M - E
                      , g = F - G
                      , V = R - U
                      , C = I - E
                      , W = O - G
                      , A = $ * W - g * C
                      , z = g * V - q * W
                      , B = q * C - $ * V;
                    o[d] += A,
                    o[d + 1] += z,
                    o[d + 2] += B,
                    o[w] += A,
                    o[w + 1] += z,
                    o[w + 2] += B,
                    o[h] += A,
                    o[h + 1] += z,
                    o[h + 2] += B
                }
                f = L - N,
                p = M - Q,
                x = F - j;
                const te = f * f + p * p + x * x;
                f = N - R,
                p = Q - I,
                x = j - O;
                const ne = f * f + p * p + x * x;
                if (te < y && ne < y) {
                    u[l++] = b,
                    u[l++] = k,
                    u[l++] = S;
                    const q = N - L
                      , $ = Q - M
                      , g = j - F
                      , V = R - L
                      , C = I - M
                      , W = O - F
                      , A = $ * W - g * C
                      , z = g * V - q * W
                      , B = q * C - $ * V;
                    o[w] += A,
                    o[w + 1] += z,
                    o[w + 2] += B,
                    o[v] += A,
                    o[v + 1] += z,
                    o[v + 2] += B,
                    o[h] += A,
                    o[h + 1] += z,
                    o[h + 2] += B
                }
            }
        for (let s = 0; s < i; s++) {
            const n = s * 3
              , _ = o[n]
              , b = o[n + 1]
              , k = o[n + 2]
              , S = Math.sqrt(_ * _ + b * b + k * k);
            if (S > 1e-6) {
                const d = 1 / S;
                o[n] = _ * d,
                o[n + 1] = b * d,
                o[n + 2] = k * d
            } else
                o[n] = 0,
                o[n + 1] = 0,
                o[n + 2] = 1
        }
        return l
    }
    self.onmessage = r => {
        const e = r.data
          , t = e.id;
        if (!J) {
            D.push({
                id: t,
                msg: e
            });
            return
        }
        K(t, e)
    }
    ;
    let T = !1;
    function K(r, e) {
        if (e.type === "init") {
            e.debug && (T = !0),
            Y(e.width, e.height, e.segX, e.segY, e.tearThreshold, e.stiffness).then(a => {
                P.set(r, a),
                self.postMessage({
                    type: "ready",
                    id: r,
                    particleCount: a.exports.particle_count(),
                    constraintCount: a.exports.constraint_count()
                });
                for (const i of a.pendingMessages)
                    K(r, i);
                a.pendingMessages.length = 0
            }
            ).catch(a => {
                console.error("[cloth.worker] init failed", a)
            }
            );
            return
        }
        if (e.type === "dispose") {
            P.delete(r);
            return
        }
        const t = P.get(r);
        if (t)
            switch (e.type) {
            case "grab":
                t.exports.grab(e.slot ?? 0, e.x, e.y, e.z, e.radius);
                break;
            case "moveGrab":
                t.exports.move_grab(e.slot ?? 0, e.x, e.y, e.strength);
                break;
            case "releaseGrab":
                typeof e.slot == "number" ? t.exports.release_grab(e.slot) : t.exports.release_all_grabs();
                break;
            case "cut":
                t.exports.cut(e.mx, e.my, e.mz, e.px, e.py, e.radius);
                break;
            case "drop":
                t.exports.drop_pins();
                break;
            case "step":
                {
                    if (T) {
                        const l = performance.now();
                        t.exports.step(e.gx, e.gy, e.gz, e.damping, e.iterations, e.subSteps);
                        const s = performance.now() - l
                          , n = t._stats || (t._stats = {
                            sum: 0,
                            max: 0,
                            n: 0
                        });
                        n.sum += s,
                        s > n.max && (n.max = s),
                        n.n++,
                        s > 10 && console.warn(`[cloth.worker SPIKE id=${r}] step=${s.toFixed(1)}ms`),
                        n.n >= 60 && (console.log(`[cloth.worker id=${r}] step avg=${(n.sum / n.n).toFixed(2)}ms  max=${n.max.toFixed(2)}ms  over ${n.n} steps`),
                        n.sum = 0,
                        n.max = 0,
                        n.n = 0)
                    } else
                        t.exports.step(e.gx, e.gy, e.gz, e.damping, e.iterations, e.subSteps);
                    let a = t.posView;
                    if (a.buffer !== t.exports.memory.buffer || a.length !== t.exports.pos_len()) {
                        const l = t.exports.pos_ptr()
                          , s = t.exports.pos_len();
                        a = new Float32Array(t.exports.memory.buffer,l,s),
                        t.posView = a
                    }
                    let i;
                    const y = e.buffer;
                    y instanceof ArrayBuffer && y.byteLength === a.byteLength ? i = y : i = new ArrayBuffer(a.byteLength),
                    new Float32Array(i).set(a);
                    const u = Z(t)
                      , c = new ArrayBuffer(t.normalsBuf.byteLength);
                    new Float32Array(c).set(t.normalsBuf);
                    const m = new ArrayBuffer(u * 4);
                    new Uint32Array(m).set(t.indexBuf.subarray(0, u)),
                    self.postMessage({
                        type: "stepResult",
                        id: r,
                        buffer: i,
                        normals: c,
                        index: m,
                        drawCount: u,
                        brokenCount: t.exports.broken_count()
                    }, [i, c, m]);
                    break
                }
            }
    }
}
)();
