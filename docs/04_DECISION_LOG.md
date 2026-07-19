## DL-089

### Title
Git Repository Initialized

### Status
Approved

### Description
The Rezel project repository has been initialized locally.
All future development will be tracked through Git.

DL-090

Production monorepo approved.

Status:
Approved

## DL-091

### Title
Adopt pnpm Workspace

### Status
Approved

### Reason
Rezel will use a monorepo with shared packages to improve scalability and code reuse.

---

## DL-092 — 2026-07-19

### Title
Fibonacci Sphere for Particle Distribution

### Status
Approved

### Reason
Uniform surface distribution avoids clustering artefacts. Computed once in `useMemo`; zero runtime cost.

---

## DL-093 — 2026-07-19

### Title
Single Points Draw Call for Particles

### Status
Approved

### Reason
Both `OrbitParticles` and `StarsField` use a single `<points>` primitive per system. Avoids per-particle draw calls, keeping GPU overhead minimal.

---

## DL-094 — 2026-07-19

### Title
Additive Blending for Emissive Mesh Materials

### Status
Approved

### Reason
Additive blending with `depthWrite: false` allows glowing meshes to stack visually without overwriting the depth buffer, preventing z-fighting on transparent geometry.

---

## DL-095 — 2026-07-19

### Title
No `postprocessing` Direct Peer Import

### Status
Approved

### Reason
`BlendFunction` from the raw `postprocessing` peer dep is not hoisted in pnpm. `Vignette` default blend is `NORMAL` — no prop required. Avoids adding an unnecessary direct dependency.

---

## DL-096 — 2026-07-19

### Title
BootScreen Stale Closure Fix via Ref

### Status
Approved

### Reason
Using a `useRef` to track message index prevents the `setInterval` from being torn down and re-registered on every index change, which caused progress jumps and inconsistent message timing.