# T-Yel Tearable Calendar

**An interactive calendar built on a tearable cloth physics simulation.**  
Drag your mouse (or finger) across the fabric — it deforms, stretches and tears in real time.

🔗 **[Live demo](https://yelmartinezseo.github.io/tyel-tear-test/tyel.html)** · [Portfolio case study](https://yel-martinez-portfolio.com/tyel-tearable-calendario-fisica-tela-verlet-webassembly-pushmatrix-shopify/)

---

![T-Yel Tearable Calendar — cloth physics simulation with interactive calendar, notes and background gallery](https://yel-martinez-portfolio.com/wp-content/uploads/tyel-demo-screenshot.jpg)

---

## What It Does

T-Yel is a fully functional month calendar where the UI surface is a piece of cloth you can tear. The physics engine runs on a separate thread (Web Worker + WebAssembly), keeping the main thread free for calendar interactions at 60 fps.

- **Tear the fabric** — drag across the cloth to deform it; drag fast to rip it
- **Navigate months** — previous / next controls, current day highlighted
- **Add notes per day** — inline editor with free text, emoji and colour code
- **Swap backgrounds** — gallery of 12 photographic textures applied to the cloth mesh
- **Fully mobile-ready** — uses `height: 100dvh` for correct behaviour when browser chrome appears/disappears

---

## Tech Stack

| Layer | Technology |
|---|---|
| Bundler | Vite |
| 3D rendering | Three.js |
| Physics engine | Rust → WebAssembly (`.wasm`) |
| Concurrency | Web Workers |
| Physics algorithm | Verlet integration + constraint relaxation |
| Tearing mechanic | Distance-constraint removal |
| Calendar persistence | `localStorage` API |
| Responsive viewport | CSS `dvh` |
| Deploy | GitHub Pages |
| Licence | MIT |

---

## How the Physics Works

The cloth is a particle mesh where each node is connected to its neighbours by distance constraints. On every tick:

1. **Verlet integration** — next position is derived from the two previous positions, not from accumulated velocity. Numerically stable without extra cost.
2. **Constraint relaxation** — each constraint pulls both particles toward the correct distance.
3. **Tearing** — when the distance between two particles exceeds a threshold, the constraint is removed from the graph. No special animation: just honest physics.

The engine is compiled to WebAssembly and runs inside a dedicated Web Worker. Communication uses `postMessage` with `SharedArrayBuffer` where available, falling back to buffer copy.

---

## What Is Original Work

The cloth physics foundation is based on the **[Tearable demo by @pushmatrix](https://pushmatrix.github.io/tearable/)** (Shopify) — see [Attribution](#attribution) below.

Everything listed here is original:

- Full calendar logic (month generation, leap years, active-day highlighting)
- Per-day note system with `localStorage` persistence
- Background gallery with hot-swap (no simulation reset on change)
- WebAssembly + Web Worker integration architecture
- Three.js canvas / HTML controls co-existence without event conflicts
- `dvh`-based responsive layout for mobile

---

## Getting Started

```bash
git clone https://github.com/yelmartinezseo/tyel-tear-test.git
cd tyel-tear-test
# No build step needed for the demo — open tyel.html directly
# or serve with any static server:
npx serve .
```

The built assets in `/tearable/assets/` are pre-compiled (Vite + Rust/wasm-pack). To rebuild the physics engine from source you will need the Rust toolchain and `wasm-pack`.

---

## Attribution

This project is built on top of the **[Tearable](https://pushmatrix.github.io/tearable/)** cloth physics demo by **[@pushmatrix](https://github.com/pushmatrix)** (Shopify). The original simulation engine — Verlet integration, constraint graph, tearing mechanic — provided the physics foundation.

All calendar logic, UI, note system, background gallery, WebAssembly worker architecture and responsive layout are original work by **[Yel Martínez](https://yel-martinez-portfolio.com/wikipedia-profesional/)**.

If you fork or adapt this project, please credit both:
- [@pushmatrix](https://github.com/pushmatrix) for the original cloth physics
- [Yel Martínez / Greentech](https://yel-martinez-portfolio.com/) for the calendar layer, if you use significant parts of it

---

## Licence

MIT — see [`LICENSE`](LICENSE) for details.  
The original Tearable demo by @pushmatrix is also MIT licensed.

---

## Author

**Yel Martínez** · Digital Strategist & Tecnóloga · [Greentech](https://yel-martinez-portfolio.com/)  
[Portfolio](https://yel-martinez-portfolio.com/) · [Wikipedia profesional](https://yel-martinez-portfolio.com/wikipedia-profesional/) · [LinkedIn](https://www.linkedin.com/in/yel-martinez-informatica-seo-desarrollo-web-posicionamiento-buscadores/)
