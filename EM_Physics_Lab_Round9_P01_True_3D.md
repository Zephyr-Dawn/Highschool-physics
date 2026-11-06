# EM Physics Lab — Round 9 Codex Implementation Brief
## P01 Real Interactive 3D Force Laboratory + Exact 3D Magnetic Motion

**Status:** implementation specification for the existing repository; not a new project.
**Priority:** physics integrity > touch usability > legibility > visual polish.
**Primary platform:** tablet browsers / installable PWA; landscape first, portrait supported.
**Scope:** P01 only, with reusable 3D rendering infrastructure. Preserve P02/P03/P06 and I01-I04 unchanged unless a narrowly justified shared fix is needed.

---

## 0. Mission and non-negotiable boundaries

The existing project has eight functioning models: P01, P02, P03, P06, I01, I02, I03, I04, plus 62 original practice questions. P01 already computes genuine 3D force vectors but shows them with an isometric / 2.5D schematic. The student needs to rotate a **real depth-aware 3D scene**, view vectors from different directions, and optionally observe analytically correct 3D charged-particle motion in a static, uniform magnetic field.

This is **not** permission to turn all models into decorative 3D. Keep the existing rigorously solved planar trajectory tools in 2D. Do not replace the existing P01 planar module or the P01 force formulas. Do not create a separate standalone application or demo route that bypasses the existing home, practice, teacher controls, storage, and PWA.

Deliver a full, usable P01 upgrade with these two complementary subviews:

1. **Force Inspector (3D):** the active particle is shown with world-space `v`, `B`, and `F=q(v cross B)` arrows; students can orbit the camera and edit vectors. Provide an easy-to-understand stationary 'instantaneous snapshot' where camera motion does not modify physical quantities.
2. **Motion Explorer (3D):** particles really move in 3D under a static uniform `B`, using a pure analytic solution. At each playback time, show their correct positions, velocity vectors, magnetic-force vectors, complete predicted paths, and traveled paths. This allows straight lines, circles, and helices in one coherent model.

Preserve the pre-existing **P01 planar trajectory** mode as an explicit, always available option. Never describe an isometric SVG or an animated 2D projection as true 3D. Do not treat a rotating camera as a physical rotation of `B` or `v`.

**Global product requirement:** one student stage can hold 1-5 particles, sharing `B` and `tGlobal`, with independently editable initial positions, initial velocities, `q`, `m`, launch times, colors, and trajectories. A single-particle presentation is the default for clarity, not an architectural restriction. No inter-particle Coulomb forces, self-fields, or collisions in this phase; label this assumption.

---

## 1. Before coding: inspect and preserve the actual repository

First inspect and summarize, in working notes, the current implementation and public interfaces of:

- `src/physics/particles/lorentzForce.ts`, `uniformB.ts`, and the existing 3D force snapshot.
- `src/simulations/particle/p01ForceScene.ts`, `p01PlanarScene.ts`, P01 view composition and current P01 force SVG stage.
- `src/physics/particles/multiParticle.ts` (or its real repository location), `ParticleRoster.tsx`, independent `launchTime` behavior, storage/migration, teacher dock, playback controls.
- `src/hooks/usePlaybackClock.ts`, route-based chunk loading, PWA service worker and offline tests.
- `tests/physics`, `tests/tablet/p01.spec.ts`, existing P01 lesson/presets/questions and QA notes.

Do not assume the names are exactly as above when the repository differs. Reuse existing types and tests; create one adapter when necessary. Verify installed React and TypeScript major versions **before** choosing package versions. Do not make a sweeping dependency upgrade.

Keep a before/after list of changed files and run the existing test suite as a baseline if practicable. Preserve old persisted scenes, teacher settings, practice links and all existing routes.

---

## 2. Technology decision: actual WebGL 3D, no visual-only mockups

Preferred implementation, provided compatible with the repository:

- `three` for WebGL rendering.
- `@react-three/fiber` to integrate a real Three.js scene into the existing React app.
- `@react-three/drei` for camera orbit controls / helpers, only if beneficial.
- A **pure TypeScript physics module** that has no React, DOM, Three.js, or render dependency.

React 18 should be paired with a compatible R3F v8; React 19 with compatible R3F v9. Confirm official compatibility and existing package versions instead of blindly adopting alpha versions. Prefer stable WebGL2 rendering, not an experimental WebGPU-only renderer. Three.js `WebGLRenderer` has a WebGL2 baseline in recent releases.

Only load the 3D dependencies when the P01 3D view is actually opened. Put them behind lazy imports / Suspense; the rest of the application must not gain the entire WebGL dependency in its initial JS. Preserve the working PWA build and make the necessary 3D assets available offline after caching.

If WebGL is unavailable, the context fails to initialize, or context is lost: do not display an empty canvas or crash. Show a clear, accessible explanation and let the student switch to the existing 2D force/planar view. Handle context restore when feasible. No mandatory network-hosted 3D assets, fonts, models, or shader libraries at runtime.

Official implementation references (verify as necessary):

- https://r3f.docs.pmnd.rs/getting-started/installation
- https://r3f.docs.pmnd.rs/api/canvas
- https://r3f.docs.pmnd.rs/advanced/scaling-performance
- https://threejs.org/docs/pages/OrbitControls
- https://threejs.org/docs/pages/WebGLRenderer

---

## 3. Shared scientific conventions (never silently change them)

Use the repository's existing SI conventions. In this 3D world:

- Mathematical axes `(x,y,z)` map directly to 3D world `(x,y,z)`. `+x` points right and `+y` up when viewed front-on from `+z` toward the origin; `+z` points toward the front viewer in that preset. Three.js camera 'up' is `+y`.
- Right-handed coordinates: `x cross y = z`.
- `F_B = q (v cross B)` and `a = F_B/m`, with **signed** `q`.
- Static external magnetic field, no electric field in this new 3D motion mode; magnetic force does no work.
- `F_B dot v = 0`, `F_B dot B = 0`; speed and kinetic energy remain constant.
- A negative charge reverses force/rotation direction; reversing `B` reverses rotation; neither changes speed.

Do not rely on a camera perspective to decide the sign of a force. World-space physical vector components and the text data panel must remain invariant under orbit/zoom.

Avoid claiming a universal 3D 'left hand rule' without a defined conventional-current direction. Explain that force follows `q(v cross B)`; for negative charge, reverse the conventional-current direction. Add a concise left-hand-rule teaching panel grounded in the selected 3D orientation.

### Pure analytic 3D uniform-B solution

Implement a reusable `solveUniformB3D(state, t)` (or appropriate project-style equivalent):

For `|B|>0`, `m>0`, set

```
b       = B / |B|                           # unit B direction
omega   = -q * |B| / m                      # signed angular rate, rad/s
vPar    = dot(v0, b) * b
vPerp   = v0 - vPar
C       = cross(b, vPerp)
theta   = omega * tau

v(tau)  = vPar + vPerp*cos(theta) + C*sin(theta)
r(tau)  = r0 + vPar*tau
          + vPerp * sin(theta)/omega
          + C * (1-cos(theta))/omega
F(tau)  = q * cross(v(tau), B)
```

The sign of `omega` is essential: with positive `q` and `B=(0,0,+1)`, the particle starting with `v0=(+1,0,0)` initially curves toward **negative y**.

For small `omega*tau`, evaluate displacements with numerically stable `sinc(theta)=sin(theta)/theta` and `cosc(theta)=(1-cos(theta))/theta` formulations / series; do not divide by tiny values without protection. For `q=0`, `|B|=0`, or vanishing signed angular rate, take the continuous straight-line limit `r=r0+v0*tau`, `v=v0`. For `v0=0`, the particle remains at rest. Reject invalid mass and non-finite inputs safely with a structured issue while keeping UI snapshots finite.

Derived quantities, when defined:

```
vParallelSigned = dot(v0, b)
vPerpMagnitude = |vPerp|
R              = m * vPerpMagnitude / (abs(q) * |B|)
T              = 2*pi*m / (abs(q) * |B|)
pitchSigned    = vParallelSigned * T
K              = 0.5*m*|v0|^2
```

If `vPerpMagnitude=0`, the geometry is a straight line parallel to `B`, not a visible helix; optionally show the cyclotron characteristic time but do not falsely imply an actual circular revolution. If `vParallelSigned=0`, the trajectory is a circle in the plane normal to `B`. With both components nonzero, it is a helix. Handle straight-line / circle / helix / stationary states as distinct explicit statuses. Do not invent an 'orbit radius' when `qB=0`; use 'not applicable'.

The **current physical force arrow** must always use current `v(tau)` and shared `B`. The **initial-condition force inspector** must use selected particle's configured `v0`, not its moving instantaneous velocity unless the UI explicitly changes into a 'current instant' inspection state.

Never infer 3D physical motion from a spline, Three.js animation curve, fake screen-space circle, or approximation to the rotating SVG. Paths must be sampled **from the pure analytic solver** at real simulation times. Drawn prediction and measured values must agree.

---

## 4. The actual student-facing 3D experience

### 4.1 Layout and subviews

Inside the existing P01 route (`/#/particle/lorentz-force`), retain the P01 module identity, home card, lessons, questions, and teacher controls. Add clear subview choices:

- `3D force`: default for the P01 3D section; stationary spatial vector analysis.
- `3D motion`: exact analytic magnetic motion with play/pause/scrub/keyframes.
- `2D motion`: the original validated planar particle motion as before.

Do not replace these with three independent pages or split-screen windows. Switching viewing modes must not silently lose saved particle configurations. If a change actually replaces an incompatible experiment, explicitly ask or provide a recoverable preset; prefer persisting separate mode states rather than destroying the other mode's scene.

Tablet landscape: large 3D stage (roughly 60-70% of usable width), a readable collapsible parameter/particle panel, bottom playback toolbar, and teacher/lesson drawers that do not permanently obscure the stage. Tablet portrait: the stage remains large and usable; controls move to tabs or a bottom sheet. Respect safe-area insets and dynamic browser chrome. Do not rely on hover.

### 4.2 Visualization and teaching elements

Create a genuinely perspective/depth-rendered scene with:

- Clearly labeled and physically accurate `x/y/z` axes; subtle reference grid and optional reference plane.
- A small orientation gizmo showing world axes as the camera moves.
- Particle spheres with A-E color identifiers; color is not the only distinction (also labels/line types).
- World-space `B`, `v`, and `F` vectors; the `B` field is shared, and force/velocity vectors are attached to the selected particle or all particles when teacher layers request them.
- Arrowheads, origins, magnitudes, signed vector components, and an accessible show/hide legend.
- Initial point, current point, projected path, traveled path, projected `v_parallel`/`v_perp` decomposition, helix axis, radius, period, pitch when meaningful.
- Optional translucent plane normal to `B` and the projection of the particle onto it, to explain why the helix is a circle viewed along its axis.
- Teacher modes: hide answer arrows, show `v` only, show `B` only, reveal `F`, show all, reveal projections and formulas.

**Arrow-length policy:** `v`, `B`, and `F` have different units and must NOT be drawn with a common physical-unit scale pretending their lengths are directly comparable. Use separately identified visual scales or normalized, clearly explained arrow lengths. Numerically exact SI magnitudes and components belong in the data panel.

Provide front (`+z`), side (`+x`), top (`+y`), oblique, and reset-camera buttons. Rotating or zooming the camera must never modify initial conditions or simulation time. In the front `+z` view, planar `Bz` direction should visually correspond to the existing `dot/cross` notation as appropriate.

### 4.3 Particle motion, time controls, and synchronized views

Preserve global simulation time `tGlobal` and per-particle `launchTime_i`, with local time `tau_i=tGlobal-launchTime_i`. Before launch, mark a particle as 'waiting' and do not display a false moving position. In 3D motion, the trajectory, current position, `v(tau)`, `F(tau)`, data panel, pause/step/scrub, and teacher overlay must come from the SAME analytic snapshot at the SAME time.

Support 1-5 independent particles IN ONE 3D CANVAS, not five panels, not five cloned canvases. One shared `B` and clock; individual `r0=(x0,y0,z0)`, `v0=(vx,vy,vz)`, signed `q`, positive `m`, color and launch time. No inter-particle forces or collisions. Overlapping particles are allowed physically and must remain selectable via the roster.

A student dragging / editing particle A during playback must update ONLY A's candidate 3D curve and values. B-E keep moving in real simulation time; global clock does not pause or jump. On release, re-launch only A at the current `tGlobal` if playing, preserving others' launch times and trajectories. If originally paused, keep paused. Changing shared `B` or another shared physical-field definition must trigger an explicitly labeled full-experiment recalculation/restart, not a fake continuous time-varying field. Camera drag is never a physical edit.

The 3D force inspector can display all particles' initial force vectors at their configured positions without requiring the clock to run. The student must be able to focus one selected particle while leaving others visible or temporarily hiding their teacher overlays.

---

## 5. Touch UX: intentional, conflict-free, and reversible

Design the P01 3D stage for real fingers, not mouse-only debugging.

- One finger on empty space: orbit/rotate the **camera**.
- Two fingers on empty space: pinch to zoom and pan the camera; preserve physical state.
- One finger on a selected vector tip/particle handle: edit that **particle's** relevant initial vector or `r0` in a defined coordinate constraint.
- If a second touch arrives during handle editing, cancel the draft safely before handing gesture control to the camera; do not accidentally change `q`, `B`, or `r0`.
- Shared field vector `B` may be edited via a deliberate **separately labeled** shared-field control, never by accidentally dragging a particle vector.
- Provide larger transparent hit proxies (~44 CSS px minimum) around thin arrows / tips; selected state and drag constraint should be visually obvious.
- Provide a non-gesture path using accessible `x/y/z`, `vx/vy/vz`, and `Bx/By/Bz` numeric fields/sliders, with reset and presets. Do not make editing dependent on difficult 3D hit testing.

**Important depth ambiguity:** A 2D finger position cannot uniquely specify an arbitrary 3D vector. Do not implement a misleading unconstrained 'free 3D drag'. Instead explicitly show which drag plane is active (`XY`, `XZ`, `YZ`, or camera-facing plane with defined fixed depth), compute proper ray-plane intersections, and allow switching plane or using component controls. Keep the unaffected component fixed. Explain the editing plane in the UI. A usable first implementation may prioritize the XYZ component panel plus reliable constrained dragging, rather than a complicated gizmo that fails on touch.

After editing any *initial condition* while playing, show the new predicted curve immediately (during `pointermove`), keep global time continuous for others, and re-launch the selected particle at commit. Do not confuse this with live external-field dynamics. Avoid `preventDefault` on the whole page; scope touch-action handling to the stage only. Support pause, single-step, time slider, speed choices, and reset camera independently.

---

## 6. UI states, examples, and classroom presets

Use a coherent set of verified P01 presets, such as:

1. Positive charge, `B` out of screen, `v` to right: `F` down; front view.
2. Negative charge with the same `B,v`: `F` up.
3. Parallel `v` and `B`: `F=0`, straight motion.
4. Perpendicular `v` and `B`: circular motion in a plane normal to `B`.
5. Oblique initial velocity: helix with visible pitch and radius.
6. Reverse magnetic field: opposite curvature.
7. Different masses with equal `q,B,v`: differing radius/period, same instantaneous `F`.
8. Same-speed positive/negative charges in one shared `B`: opposing rotation.
9. Three particles with distinct velocity components, compared in the same 3D canvas.
10. Shared-field change: all particles recomputed and clearly restarted.

Presets must use the SAME physical data as tests; do not manually arrange illustrations to match an intended answer. Give each preset a short observation question and one-click camera orientation for the intended teaching point.

Teaching progression (suggested, adapt existing eight-step lesson rather than duplicate it): 3D axes -> `v cross B` -> charge sign -> null-force cases -> magnetic force does no work -> velocity decomposition -> circle/helix -> multi-particle comparison. Provide 'predict before reveal' teacher mode. Add 4-6 ORIGINAL questions focused on genuinely spatial reasoning, without altering existing correct P01 questions; if adding content updates schema and question totals, calculate counts from the data rather than hardcoding them across pages.

---

## 7. Architecture, storage, and deterministic testing

Recommended architecture (adapt to existing naming rather than duplicating existing modules):

```
src/physics/particles/uniformB3D.ts      // pure analytic solver, sampling, properties
src/simulations/particle/p01ThreeDScene.ts // adapter to shared roster + launchTime
src/simulations/particle/P01ThreeDStage.tsx // WebGL scene only, renderer-agnostic data
src/simulations/particle/P01ThreeDPage.tsx  // P01 controls / study / teacher
src/components/three/AxisGizmo.tsx
src/components/three/VectorArrow3D.tsx
src/components/three/TouchVectorHandle.tsx
src/components/three/CameraPresets.tsx
src/components/three/WebGLFallback.tsx
```

Prefer adapters/reuse rather than second roster/clock implementation. Maintain a clean separation:

1. Physical state: `r0,v0,q,m,B,launchTime` and a pure solver.
2. Scene state: selection, editing draft, show/hide overlays, current mode and camera preset.
3. Render state: Three.js mesh refs, dynamic geometry and camera orientation; **not** an alternate source of physical truth.

Keep the 3D orbit controls and rendering updates light. Do not call React `setState` on each rendered frame solely to move meshes; use the scene's frame callback with refs and a periodic/throttled UI snapshot for visible numeric values. Recompute complete static predicted paths on a parameter change, not every frame. Use geometries and materials efficiently; reuse and dispose WebGL resources on unmount/route switch. Keep type-safe vector utilities and predictable pure physics tests.

Persist a versioned 3D scene (selected particle, field, 1-5 particle definitions, teacher/viewport preferences). Support migration from the current P01 3D force scene where `r0` may be absent (default to a safe position), preserve existing `q/m/v/B` and old planar scenes. Loading damaged JSON or out-of-range vectors must fail safely, with a human-readable error / fallback. Do not restore arbitrary stale GPU state or resurrect an old running clock after reload. Preserve import/export and offline capabilities.

Rendering a selected particle at `r(t)` must not mutate its stored initial `r0`. Coordinate transforms should be explicitly named and tested so that projected world axes and physical signs do not silently invert in a camera orientation preset.

---

## 8. Tablet performance and graceful degradation

Use geometric primitives and simple materials first. Avoid elaborate shaders, physically based reflections, bloom, ambient occlusion, postprocessing stacks, massive transparent particle trails, and network-loaded models. A clear physics diagram is more important than game-like aesthetics.

- Cap display-pixel ratio sensibly (e.g. initial R3F `dpr={[1,1.75]}`) and consider adaptive DPR after measured regressions.
- Limit path points per visible particle; adapt to projected curvature / zoom and avoid re-sampling all 5 paths every animation frame.
- Pause or lower render activity when paused and camera still; consider a demand frame-loop or an explicit invalidation path that correctly handles camera and physics changes. Do not use demand rendering without invalidating every animated state change.
- Limit shader/mesh count and use shared materials where possible. Theoretical path sampling must remain exact even if visual geometry is decimated.
- Keep 3D dependencies off the home page and all non-P01 routes. Report new JS/CSS chunk sizes and PWA precache changes.
- Handle context loss, route transitions, repeated entering/exiting 3D, device rotation, and back-forward navigation without memory leaks or broken controls.
- Offer a 'low graphics' toggle and a 2D fallback that preserve the underlying physics and teaching data.

Target smooth 60 fps on real capable tablets, but DO NOT claim it is achieved without physical-device testing. Measure production-preview 1 and 5 particle cases, teacher overlays, camera orbit, and continuous drag; report frame-time distribution, p95/p99, heap/memory when measurable, and rendering platform. Headless Chrome rAF estimates are **not** iPad Safari / Android Chrome validation.

---

## 9. Mandatory physics verification: exact reference cases

Create deterministic Vitest unit tests for the standalone solver, at least:

| ID | Setup | Required truth |
|---|---|---|
| D1 | `q=1,m=1,B=(0,0,1),r0=(0,0,0),v0=(1,0,1)` | `R=1,T=2pi,pitch=2pi`; at `t=pi/2`, `r=(1,-1,pi/2)`, `v=(0,-1,1)`, `F=(-1,0,0)` |
| D2 | D1 with `v0=(1,0,0)` | pure circle in xy plane, no z drift |
| D3 | D2 with `B=(0,0,-1)` | at `t=pi/2`, `r=(1,1,0)`, `v=(0,1,0)` |
| D4 | D2 with `q=-1` | same reversal as D3 |
| D5 | `v0` parallel or antiparallel to nonzero `B` | `F=0`, straight line, no invented helix |
| D6 | `q=0`, `B=0`, `v0=0` separately | straight line or rest; no NaN or fake radius |
| D7 | arbitrary 3D `v,B`, positive and negative charge | `F=q(v cross B)`, `F dot v=0`, `F dot B=0` to scale-aware tolerance |
| D8 | multiple times, arbitrary oblique `B` | constant speed and kinetic energy; trajectory derivative matches velocity; velocity derivative matches `q/m (v cross B)` |
| D9 | `B` approaches zero across safe small magnitudes | smooth convergence to straight-line solution (position and velocity) |
| D10 | compare `B=(0,0,Bz)` projection against P02 | xy positions/velocities match validated planar solver for equal inputs |
| D11 | 3 particles with independent launch times | correct waiting / local-time states; editing A does not change B/C snapshots |
| D12 | change shared `B` | all physically recomputed and reset together; camera remains independent |
| D13 | oversized / corrupt / non-finite / invalid mass inputs | safe issue and finite renderable state; no unhandled exception |
| D14 | force-inspector arrows | q reversal flips `F` but not `B,v`; mass change changes `a` not `F` |

Use robust tolerances related to numerical scale; never choose tolerances so loose that wrong handedness passes. Test signed curvature in both front and arbitrary-camera representations. A camera transform must alter screen projection, NOT the physical sign or magnitude.

Note that standard proof cases take `m=1 kg,q=1 C,B=1 T` for computational transparency; they are instructional SI examples, not realistic electron-beam apparatus parameters.

---

## 10. Mandatory Playwright tablet, fallback, and regression tests

Add a dedicated P01 3D test file and include it in `npm run test:tablet`. Required cases:

1. P01 3D force view loads a REAL WebGL canvas and renders axes plus physically sourced arrows (not just a static SVG screenshot); user may return to existing 2D mode.
2. Orbit on empty stage changes camera/orientation but leaves `B`, `v`, `F`, `q`, `m`, and physical simulation time unchanged.
3. Touch pinch changes zoom only; does not drag vector handles or change particle initial conditions.
4. Camera preset front/side/top/reset works, with consistent axis labels and correct physical signs.
5. Single-particle `v` edit via component inputs and constrained handle updates force, prediction, radius and pitch while playing; uses independent particle re-launch semantics.
6. Three particles A/B/C exist in ONE 3D canvas; editing A during playback changes A only, and B/C positions continue to progress against the unchanged global timeline.
7. Adding up to five particles, duplicate/delete/select, waiting state, overlap selection via roster and per-particle teacher overlays work.
8. Changing shared `B` triggers a declared full restart; camera-only gestures never do so.
9. In 3D motion, play/pause/scrub/step updates particle, path and `F/v` consistently; no screen-space fake trajectory.
10. Front/side and oblique screenshots are materially different perspectives of the SAME scene, not two pre-rendered static images.
11. Context-unavailable or context-lost scenario shows the 2D fallback and the rest of the app remains usable.
12. Landscape/portrait views (at least 1024x768, 1194x834, 768x1024, 810x1080) fit controls without horizontal overflow or unsafe clipped interaction zones.
13. PWA production offline reload can open P01 3D after initial caching, and an existing P01 saved scene migrates correctly.
14. Existing P02/P03/P06 multi-particle, I01/I02/I03/I04 continuous-edit behavior, practice/progress, and other PWA routes all remain functional.

Keep existing checks and upgrade assertions only when semantics genuinely change. No skipped tests, no placeholder pass assertions, no hardcoded false screenshot artifacts. If WebGL is unavailable in the headless CI environment, report it honestly, test the fallback, and run the WebGL scenario using a supported real GPU/browser environment when available; do NOT claim visual verification that did not occur.

Record screenshots under `docs/screenshots`, with names such as:

```
p01-3d-force-oblique.png
p01-3d-force-front.png
p01-3d-force-negative-charge.png
p01-3d-helix-oblique.png
p01-3d-helix-front.png
p01-3d-five-particles.png
p01-3d-live-edit-a.png
p01-3d-teacher.png
p01-3d-portrait.png
p01-3d-fallback.png
```

---

## 11. Delivery order / definition of done

Implement in this sequence:

**Phase A — Inventory + solver.** Examine repository, dependency compatibility, baseline tests. Write pure analytic `uniformB3D` solver, exact reference cases D1-D14, explicit numerical/degenerate handling. Do not start by polishing a 3D UI.

**Phase B — Real 3D force inspector.** Add lazy WebGL stage to the actual P01 page; orbit/pinch, labeled axes, physically correct `B,v,F`, q-sign controls, camera presets, teacher answer reveal, 2D fallback. Preserve old modes.

**Phase C — Exact 3D motion + multi-particle.** Integrate global clock and 1-5 independent particles, true time-dependent analytic helical/circular/straight motion; shared magnetic field; per-particle editing and re-launch.

**Phase D — Touchable classroom UX.** Add constrained handle dragging, accessible numeric alternative, prediction overlays, camera focus, 3D pedagogical presets, portrait controls, and 4-6 new original practice tasks.

**Phase E — QA + delivery.** Tests, production build, PWA offline, camera and touch E2E, screenshots, bundle/heap/frame-time measurements, docs and migrations. Maintain the existing regression suite.

Run at minimum:

```
npm run typecheck
npm test -- --run
npm run build
npm run test:tablet
npm run test:pwa
```

Use the project's real package scripts if they differ. Report exact results, not assumed or guessed counts.

Update README, `docs/PHYSICS_SPEC.md`, `docs/REQUIREMENTS.md`, `docs/CONTENT_MAP.md`, `docs/DECISIONS.md`, `docs/QA.md`, relevant original-question data, and model registry **only if needed**. Do not falsely claim iPad/Android real hardware testing. Produce a short physical-device test checklist for 3D touch (iPadOS Safari and Android Chrome): camera drag, pinch, vector drag, finger lift/cancel, display rotation, WebGL context/background restore, offline launch, battery/heat, text scale, VoiceOver/TalkBack alternatives, and five-particle teacher mode.

The result is accepted ONLY when a student can open the existing P01 route on a tablet, rotate an actual 3D scene, inspect correctly directed `v/B/F` vectors, start a true 3D magnetic trajectory, interact with one of several moving particles without stopping the others, and continue to use the existing two-dimensional experiments and offline app.

**Begin inspecting the actual repository and implementing. Do not stop after producing a plan, a mockup, or a standalone 3D proof of concept.**
