# EM Physics Lab - Round 12 / Dual Delivery: I05 + I06

**Implementation brief for Codex**  
**Priority:** deliver TWO real integrated modules, I05 AND I06, in one round; neither is an optional stretch goal.  
**Scope:** I05: moving loop in a time-varying magnetic strip. I06: two conducting rods moving on shared parallel rails in a static uniform field. Both require correct induction, dynamics, energy, touch controls, original lessons/questions, persistence, offline support and full regressions.  
**Status:** requirements, not a claim of implementation or measured results.

---

## Delivery contract - read before implementing either model

- Single development round, **two completed modules**: I05 and I06. Do not mark the round complete when I05 alone is green.
- First review the real repo and the original model matrix; if the I06 title/geometry conflicts with its established definition, preserve the canonical model ID and record the discrepancy before editing.
- Work can be parallelized by scoped tasks/worktrees or available Codex subagents, but only when changes are merge-safe. Keep shared-file integrations serialized and avoid two agents simultaneously editing `questions.ts`, `lessons.ts`, `registry.ts`, `App.tsx`, global CSS, docs or content tests. Prefer isolate physics modules and tests first, then integrate both.
- Each model has its OWN physics engine, independently checkable energy balance, state/schema, stage, page, lessons, original practice, preset links, tablet tests, and offline acceptance. Reuse shared UI primitives and utilities where physically appropriate; never force unrelated models into one monolithic solver.
- Do not claim 13 COMPLETE until both modules pass all gates. Existing 11 COMPLETE, P08 PARTIAL, I07 MISSING, I08 OPTIONAL statuses are assumptions based on the user report; verify the checkout.
- Speed comes from coordinated parallelism and reduced task-switching, **not** truncated physics rigor, fake data, skipped tests or broken older models.

## 0. Context, audit, and non-negotiable rules

According to the latest development report (verify the actual repository before editing):

- COMPLETE: P01-P07, I01-I04 (11 models).
- PARTIAL: P08. MISSING: I05, I06, I07. OPTIONAL/PLANNED: I08.
- 92 original practice questions currently exist.
- Post-Round-11.5 reported baseline: 388/388 Vitest, 117/117 Playwright, 2/2 PWA. These are reference counts, not a substitute for inspecting the current checkout.
- Round 11.5 installed shared safe mathematical-expression parameter controls across all existing physical numeric parameters; do not bypass them in I05.

**First, inspect:** README.md; docs/REQUIREMENTS.md; docs/CONTENT_MAP.md; docs/PHYSICS_SPEC.md; docs/DECISIONS.md; docs/QA.md; docs/MODEL_COMPLETION_MATRIX.md (or its actual location); docs/PARAMETER_INPUT_SPEC.md; docs/PARAMETER_INPUT_AUDIT.md; docs/AGENT_HANDOFF.md; and existing I01/I02/I03/I04 physics, clock, charts, gesture, storage and routing code.

If file paths differ, discover them rather than silently creating a parallel architecture. If the original I05 scope conflicts with this brief, record the discrepancy and preserve the established model ID. Do not invent a finished status for anything absent.

**Never:**

1. Create a placeholder page, canned trajectory, decorative current arrows, or a fake energy-conservation display.
2. Reset simulation time on every live manual B or loop-position pointer move.
3. Treat manual imposed movement as freely evolving Newtonian dynamics.
4. Claim that magnetic braking always occurs whenever there is induced current.
5. Force the particle A-E roster into a loop-induction model. Multi-particle requirements apply to particle models; I05 is a single rigid electrical loop by default.
6. Execute user input as JavaScript, clamp valid text values to a slider range, or silently coerce physically invalid values.
7. Remove, skip, weaken, or rewrite unrelated existing tests to make a green report.
8. Declare a real iPadOS/Android hardware test complete using desktop Chrome/CDP simulation.

This round implements **BOTH I05 and I06**. Do not implement I07/P08/I08 or a broad unrelated redesign. Both modules are required for completion.

## 1. Student learning outcomes and I05 vs existing models

Students should be able to:

- Distinguish transformer EMF caused by a changing external B(t) from motional EMF caused by a moving loop boundary.
- Recognize that both contributions can reinforce or cancel while the total flux remains continuous.
- Predict current direction, magnetic drag or drive, loop acceleration, and energy flow using a single sign convention.
- Explain why a loop fully inside a *spatially uniform* B(t) can carry induced current while having zero net x-directed magnetic force.
- Verify that heat can be supplied partly or entirely by the external source maintaining the time-varying field, not only by mechanical work.
- Compare static B and fixed-loop limits against I03 and I04; and recognize how I05 differs from the sliding-bar model I02.
- Solve Chinese high-school electromagnetic-induction problems using flux/EMF/current/force/power curves and segmented dynamics.

Deliver four interactive modes within one I05 page:

**M1 - Prescribed uniform loop velocity and analytic B(t).** Set x0 and signed v, allow constant/linear/sinusoidal B. Movement is externally constrained. Compute the force the external agent must apply to maintain this motion and the corresponding work. This is the primary high-school algebra/graph mode.

**M2 - Dynamic loop with externally imposed B(t).** For an unforced loop or a configurable constant external force, solve Newton's equation coupled to induction. Include static-B analytic regression cases. The full general time-varying case is a numerical ODE problem; do not incorrectly claim a general closed-form analytic solution.

**M3 - Live manual B control with dynamic loop.** Manipulate a shared external B(t) control *during playback*; B follows the already defined I04/I01 rate-limited 0.4-s ramp / 4 T/s semantics. Simulate mechanical response continuously with no history reset. Retain exact simulator-time B(t) and dB/dt history; do not infer EMF from screen-frame frequency.

**M4 - Live manually dragged loop with prescribed or live B(t).** Move the actual loop along x using touch. Motion is an externally imposed constraint, and v is derived from monotonic timestamp samples, following I02 gesture conventions. Show EMFs, current and magnetic force during motion and retained time history. Clearly label estimates; do not present an invented exact applied-force/energy residual. Upon release, default to a stationary externally held loop; any switch to free dynamics must be an explicit option with a documented initial-velocity handoff.

Keep mode switching semantic and visible. It may reset the *experiment definition* after confirmation; this is different from live interaction inside a mode.

## 2. Geometry, coordinates and signs - fixed contract

Use a fixed rectangular loop in the x-y plane, height h along y, width w along x, with **left edge x(t)** and right edge x(t)+w. The externally imposed magnetic field is perpendicular, Bz(t), nonzero only in a fixed spatial strip [a,b] along x (b>a), assumed uniform in y over the loop. Outside the strip, idealize Bz=0.

Positive normal: +z (out of screen, dot symbol). A *positive* induced EMF/current circulates counterclockwise when viewed from +z. Negative EMF/current circulates clockwise. Bz>0 is out of screen; Bz<0 is into screen. Maintain exact consistency with I01/I03/I04.

At any x:

```text
leftLoop = x
rightLoop = x + w
u = max(x, a)
v = min(x + w, b)
overlapLength = ell(x) = max(0, v - u)
A_eff(x) = h * ell(x)
```

Away from geometric event points, define the overlap derivative:

```text
g(x) = d ell / d x
     = indicator(a < x+w < b) - indicator(a < x < b)
```

Thus g=+1 on entry (right edge alone inside), g=0 when both loop edges are inside / both outside / the strip is wholly covered, and g=-1 on exit (left edge alone inside). This remains valid when w exceeds the strip width. At exact equality thresholds the ideal piecewise function is not differentiable; use and display one-sided values, not a fabricated single derivative. In overlap-zero cases, flux and induced quantities vanish if no field overlap exists, except for appropriately identified one-sided boundary values.

Geometry thresholds are the sorted, deduplicated set {a-w, a, b-w, b}; their ordering changes with loop width. Never assume a fixed order. Represent genuine geometric crossings and contacts as events. Infinite-strip and fully-contained degeneracies require bounded guards rather than enormous fake regions.

**Physical idealizations:** rigid thin wire with N identical closely packed turns, total concentrated resistance R>0 when closed, lumped current I, no self/mutual inductance, negligible field back-reaction, and no collisions/rail constraints except optional explicit hard stops. The discontinuous spatial field edge is a high-school idealization; communicate that in a short teacher note.

## 3. Core electromagnetic equations and shared snapshot

Let B=Bz(t), Bdot=dBz/dt, xdot=vx. Single-turn flux and N-turn linkage:

```text
Phi = B * h * ell
Psi = N * Phi

epsilon_transformer = -N * h * ell * Bdot
epsilon_motional    = -N * h * B * g * vx
epsilon_total       = epsilon_transformer + epsilon_motional
                    = -dPsi/dt
I = epsilon_total / R                    (closed circuit)
I = 0                                    (ideal open circuit)
P_J = I^2 * R                            (closed circuit)
F_Bx = N * I * h * B * g                 (net x magnetic force)
```

F_Bx is the x resultant of vertical current-carrying sides and is **not generally** `-constant * vx` if Bdot is nonzero. It may have a component driven by the changing field, and may aid or oppose imposed motion. In an ideal fully contained uniformly magnetized strip, g=0 and F_Bx=0 even if epsilon_transformer and I are nonzero. At B=0 but Bdot!=0, transformer EMF can be nonzero but instantaneous magnetic force is zero.

If a circuit is open, induced EMF may exist while I=0, P_J=0, F_Bx=0. Explicitly render the open gap and suppress visual circulating current. Preserve signed quantities and direction legends in all visualizations.

Use a shared pure physics snapshot such as (adapt actual code conventions):

```ts
type I05Snapshot = {
  timeS: number;
  positionX: number;
  velocityX: number;
  accelerationX?: number;
  Bz: number;
  dBzDt: number | null;
  overlapLength: number;
  effectiveArea: number;
  overlapSlope: -1 | 0 | 1 | null;
  fluxWb: number;
  linkageWbTurn: number;
  emfTransformerV: number | null;
  emfMotionalV: number | null;
  emfTotalV: number | null;
  currentA: number | null;
  magneticForceX: number | null;
  joulePowerW: number | null;
  magneticMechanicalPowerW: number | null;
  transformerSourcePowerW: number | null;
  kineticEnergyJ?: number;
  jouleHeatJ?: number;
  externalWorkJ?: number;
  transformerSourceWorkJ?: number;
  energyResidualJ?: number | null;
  eventFlags: string[];
  issue?: string;
  approximation?: string;
};
```

One snapshot must own the loop position, wire current glyphs, magnetic-force arrow, numeric readouts and all graphs. Avoid duplicate UI-side force or EMF calculators. Record whether an instantaneous derivative is undefined (one-sided boundary/cusp). Null means *unavailable*, never silently substitute 0 or Infinity.

## 4. Mechanical dynamics and physically honest energy accounting

### 4.1 Dynamic modes

Let m>0, F_ext(t) be a prescribed x-directed external mechanical force, and ignore friction unless explicitly added as a documented extension.

```text
xdot = vx
m * vdot = F_ext(t) + F_Bx(x, vx, t)
```

In the closed-circuit smooth interior:

```text
m*vdot = F_ext(t)
         - (N^2*h^2/R) * B * g * (ell*Bdot + B*g*vx)
```

The position-dependent overlap and B(t) make this a piecewise ODE with boundary events. A constant-B, fixed-g segment has a known exponential solution and provides a mandatory analytic reference. The general time-varying case requires a deterministic numerical integrator.

### 4.2 Power balance (critical acceptance rule)

Define:

```text
P_mech_field = F_Bx * vx = -I * epsilon_motional
P_transformer_source = I * epsilon_transformer
P_ext = F_ext * vx
P_J = I^2 * R = I*(epsilon_transformer + epsilon_motional)
```

For the ideal model:

```text
dK/dt + P_J = P_ext + P_transformer_source
K(t) - K(0) + Q_J(t) = W_ext(t) + W_transformer_source(t)
residual = (K-K0) + Q_J - W_ext - W_transformer_source
```

Where Q_J = integral(P_J dt), W_ext = integral(F_ext*vx dt), and W_transformer_source = integral(I*epsilon_transformer dt). A **nonzero** transformer contribution is not an error; the external source maintaining B(t) can supply/receive energy. Show each power/energy contribution with its sign and distinguish electrical source exchange from mechanical external work.

Independently integrate the energy/work terms; do not compute one by rearranging the conservation identity, as that would create a fake zero residual. Use appropriate numerical tolerances and never display a numerical residual as if it were a measurement for manual dragged trajectories.

### 4.3 Prescribed uniform speed

M1 uses `x=x0+v0*t` and an externally imposed constraint. If acceleration is zero, the required external force is `F_ext_required=-F_Bx`. Show P_ext=F_ext_required*v0 and the complete balance. For time-varying B this may have an unexpected sign; do not assume drag always costs positive mechanical work.

### 4.4 Manual dragged loop

M4 derives signed `vx` from monotonic event timestamps and a bounded window (reuse/adapt I02 logic). It may estimate `epsilon_motional`, current, force, and Joule heat. The actual externally applied force and instantaneous acceleration are not known from the raw finger position with sufficient accuracy. Label imposed-motion estimates and do **not** display exact `W_ext`, exact mechanical-energy residual, or a bogus Newtonian free-body acceleration unless independently supported by a tested algorithm with appropriate approximation labels.

### 4.5 Optional physical hard stops

Do not introduce an implicit x=0 stop (as in I02 rails) into this loop model. If the scene has explicit mechanical travel limits, treat collision loss separately from Q_J and label the event. Defaults should allow the loop to enter, traverse, and leave the strip.

## 5. Field waveforms and continuous control

Reuse I04's analytic field waveform and manual timeline engine where possible, but confirm interfaces and semantics before importing. Support at least:

- Constant B(t)=B0: Bdot=0.
- Linear B(t)=B0+k*t: Bdot=k.
- Sinusoidal B(t)=B0+A*sin(2*pi*f*t+phase): analytic Bdot.
- Manual time-history B(t): monotonic simulator-time targets filtered through existing I04 0.4 s ramp, max |Bdot|=4 T/s, with explicit target/actual/current-slope display.

Triangle is an optional waveform if already supported cleanly: at its corners, derivative may be undefined; expose left/right derivatives and one-sided instantaneous electrical states, not an invented single value. Avoid ideal discontinuous B jumps, delta-function EMF, or infinite current.

Manual B in M3 **does not reset t**. It appends a real input event to the authoritative B(t) history, and advances the mechanical ODE through the resulting smooth ramp. Ensure pointer frequency or React rerenders do not affect physics. If playback is paused, follow existing manual B policy: no physical change is recorded until resumed, and explain this in UI. Preserve real-time 1x clock for live B modes; never apply an unphysical 2x shortcut to rate-limited user gestures.

Changing the *definition* of a waveform or static geometry/physical parameters is different: it creates a new experiment, recomputes from t=0, and preserves previous playing/paused intent (subject to explicit UI confirmation when replacing history). Capture this distinction in tests and the manual.

Support the following invariance/cancellation experiments:

1. B changes with fixed x: purely transformer EMF.
2. Loop moves with fixed B: purely motional EMF.
3. Both change in the same flux-increasing sense: contributions reinforce.
4. Both change in opposing senses so `ell*Bdot + B*g*vx=0`: net EMF/current zero despite Bdot!=0 and vx!=0.
5. Loop entirely inside the field and x changes: g=0; no motional EMF or net x magnetic force, though varying B can induce current.

## 6. Numerical engine and boundary events

### 6.1 Pure, deterministic calculation

Create the I05 physics engine under `src/physics/induction/` (e.g. `movingLoopTimeField.ts`), with no React/DOM dependencies. The state should include x, vx, Q_J, W_ext, W_transformer_source, current time, issue/event markers and an immutable or appropriately checkpointed history. Sampling for charts is separate from solving boundary events.

### 6.2 Integration requirements

For M2/M3, use a deterministic error-controlled solver (adaptive RK45 or an equivalently verified method), with bounds on dt and maximum substeps. At fixed B and constant overlap slope, validate against the exact exponential solution, not just a second numerical solver. Keep event detection independent of the UI's rendering FPS.

Detect and locate crossing of the sorted thresholds `{a-w, a, b-w, b}` by root bracketing or analytically when motion is prescribed, then finish the step at the actual event time, record the event, select the correct adjacent region using the directional/one-sided rule, and continue from continuous x/v. Handle tangency or velocity reversal at a threshold without zero-time event loops. Same-time coincident thresholds become a single event with a list of boundary IDs. Cap events/substeps and return an explicit `event-limited` or `solver-limited` status rather than extrapolating a fake trajectory.

For piecewise Bdot transitions, integrate up to the exact field-waveform knot and continue with the right-hand derivative; display left/right values where the ideal model does not admit a unique instantaneous derivative.

### 6.3 Input update / stepping

Use one global simulator clock for x(t), B(t), and energy integrals. Integrate from last accepted state to the requested time. Pointer events submit explicit time-stamped control changes; renders only read snapshots. Rewinding/scrubbing cannot mutate or duplicate historical energy: rebuild deterministically from stored initial conditions and input events, or use validated checkpoints plus replay. On seeking into an existing manual history, make it view-only or define a clear branch/replace protocol; never append new B events to the past accidentally.

Keep exact simulator-time semantics under pause/resume, visibility changes, app background/foreground and PWA offline operation. Do not attempt to backfill hours of browser-background time with unbounded numerical work. Document the clock policy.

### 6.4 Numerical safety

Reject R<=0, m<=0, h<=0, w<=0, b<=a, nonfinite x/v/B/k/f, invalid turns N (not a positive integer), and other inputs outside the explicit stable computational domain. A user-entered mathematically valid expression outside the slider min/max must be accepted if physically/numerically valid. Never silently clamp to slider bounds. For values outside the *declared stable domain*, surface a specific error while keeping the last valid experiment intact.

Use dimensional units consistently (SI inside physics); display unit conversions without destructive rounding. For `|B|` close to zero and zero crossing, avoid divisions by B. For tiny overlap, near-tangent or near-cancelled EMF, do not produce NaN, Inf, fabricated current direction, or false energy residual.

## 7. UI, tablet gestures, and student/teacher experience

**Layout:** landscape-first large central SVG or appropriately chosen 2D stage, control panel on the side; portrait with stage above collapsible parameter and history cards. This is a 2D geometry/flux lesson: do not import P01's 3D WebGL bundle.

Stage must show:

- Moving rectangular loop, its physical left/right edges and user-adjustable x initial position; static strip boundaries a,b; physical overlapping area shaded distinctly.
- Bz field glyphs with correct dot/cross polarity and intensity encoding, including B=0.
- Arrows for vx, F_Bx and optional `F_ext`; current direction around the loop (clearly marked clockwise/CCW) or no arrow on open circuit / zero current.
- A clear distinction between changing spatial overlap and changing magnetic field strength. Different but unobtrusive colored indicators for transformer and motional EMF contributions.
- Predicted vs traversed loop history as meaningful position/time traces, with critical boundary events that can be tapped from the event timeline.
- Pause/play/step/timeline and 0.5x/1x/2x where physically valid; M3 manual live B must retain correct 1x real-time meaning.

**Live touch interactions:**

- Drag the loop along x for M4; immediately update overlap, EMF components, current, force and charts. Sample using timestamps as in I02. No timeline resets during the drag.
- Drag manual B with the I04 continuous ramp semantics in M3; show actual B(t), not merely a target value.
- Distinguish camera pan/pinch from draggable handles. Second finger cancels single-pointer edits in a safe/obvious way; avoid accidental page scrolling (`touch-action` applied narrowly), text selection and browser gesture conflicts.
- At least 44x44 CSS px effective interactive targets; screen zoom, system font settings, focus outlines and landscape/portrait are considered. Never rely on hover-only labels.
- Exiting a page/refreshing while a pointer is captured must not leave playback or parameters in an impossible state.

**Parameter inputs (Round 11.5 is mandatory):**

- Reuse `ParamSlider`, `parameterExpression.ts`, `parameterValidation.ts`, and `MathTargetInput` where appropriate; inspect current APIs. Retain original sliders and add the safe expression input to every physical numeric parameter.
- Support `sqrt(2)`, `\sqrt{3}/2` only if accepted by the existing parser, `√3/2` where supported by its current UI, `1/3`, `pi`, `2*pi`, `(1+sqrt(5))/2`, scientific notation, exponentiation and signed decimals per established parser specification. Do not fork parser behavior.
- Geometry a,b,w,h; N,R,m; x0,v0,Fext; waveform B0,k,A,f,phase; time window and any other physically adjustable number all get validated expression controls.
- No hidden clamping to sliders; no forced rounding; invalid/incomplete expressions stay as text and do not modify simulation state. Physical constraints and numerical stable domains produce distinct feedback. Enter/blur commits and Escape cancels. Preserve units and manual B target limits visibly.

**History charts and data:**

Group switchable plots instead of drawing all tracks every frame:

1. B(t), dB/dt, overlap ell(x), Phi or Psi.
2. epsilon_transformer, epsilon_motional, epsilon_total, signed I.
3. x(t), vx(t), F_Bx(t), optional Fext.
4. K, Q_J, W_ext, W_transformer_source, residual, for verified dynamic/prescribed modes.

Offer linked cursor across charts and stage and explicit discontinuity/one-sided markers. Show signed, unit-labeled numerical readouts that share the physics snapshot with arrows and plots. Throttle drawing only, **never** throttle/approximate the actual physical integration or boundary-event search to improve FPS.

**Teacher mode:** toggle B glyphs, overlap shading, normal, flux, EMF decomposition, forces, power flow, energy equation, event timeline and answer masking. Add an overlay that visually teaches `epsilon_total = epsilon_transformer + epsilon_motional`, plus a selectable "same-direction / cancellation" comparison preset. Preserve existing lesson vs teacher UI patterns.

## 8. Presets, learning content, practice, and mapping

Provide at least 10 reproducible, named presets with explicitly stored parameters, e.g.:

1. Static B + entering loop (motional only).
2. Fixed loop + linear B(t) (transformer only).
3. Moving loop + rising B (reinforcing contributions).
4. Moving loop + rising B (cancellation at a designated instant).
5. Fully contained loop + time-varying B (current but no x force).
6. Exiting loop + B sign reversal.
7. Open circuit (EMF without current/heat/force).
8. Free deceleration in constant B (analytic damping).
9. Driven loop in varying B (source/mechanical energy split).
10. Manual B live coupling and manual-loop gesture showcase (may be separate presets).
11. Optional: triangle waveform cusp with one-sided derivatives.

Write at least 8 coherent, high-school-oriented lesson steps, culminating in a worked energy-balance question. Provide at least 8 original questions, including signed EMF, source decomposition, cancellations, current direction, magnetic force, free damping, energy-source identification and boundary crossing. Include at least 2 computational questions and 2 reasoning/multiple-select items; each question needs authored solution and tiered hints, a verified simulator preset link, and stable question IDs.

All exercises must be identified as **original**. Do not fabricate or import exam-question text/images/answers and do not change the status of unverified exam source links. If linking the model to existing exam references, maintain verifiedOnline:false until source and rights verification is completed.

## 9. Mandatory exact numerical and analytical anchors

Implement a standalone table-driven physics test suite. Test derivations independently of the production function and verify signs, units and energy, not only finiteness. Use these numerical anchors (all SI). Choose time origins consistently.

**A - Static field, entering at speed 1**

```text
N=1, h=1, w=1, R=2, B=+2, a=0, b=3
x=-0.5, vx=+1, ell=0.5, g=+1, Bdot=0
Phi=+1 Wb
epsilon_t=0, epsilon_m=-2 V, epsilon_total=-2 V
I=-1 A, P_J=+2 W, F_Bx=-2 N
P_mech_field=-2 W, P_transformer_source=0
```

**B - Moving loop + changing field at a precise snapshot**

```text
N=1, h=1, w=1, R=2, a=0, b=3
B(t)=2+t; at t=0.5: x=-0.5, vx=+1, ell=0.5, g=+1
B=2.5 T, Bdot=1 T/s
Phi=1.25 Wb, epsilon_t=-0.5 V, epsilon_m=-2.5 V
I=-1.5 A, epsilon_total=-3 V
F_Bx=-3.75 N; P_J=4.5 W
P_mech_field=-3.75 W, P_transformer_source=+0.75 W
For constant speed: F_ext_required=+3.75 N, P_ext=+3.75 W
P_ext + P_transformer_source = P_J = 4.5 W
```

**C - Cancellation**

```text
N=1, h=1, w=1, R=2, a=0, b=3
ell=0.5, g=+1, B=2, Bdot=1, vx=-0.25
ell*Bdot=+0.5; B*g*vx=-0.5
emf_total=0, I=0, F_Bx=0, P_J=0
Both contribution magnitudes are nonzero, with opposite signs.
```

**D - Loop fully within field**

```text
N=1, h=1, w=1, R=2, a=0, b=3
x=0.5, ell=1, g=0, Bdot=1
emf_t=-1 V, emf_m=0, I=-0.5 A
P_J=0.5 W, F_Bx=0, P_transformer_source=+0.5 W
```

**E - Exit reverses motional current**

```text
N=1, h=1, w=1, R=2, a=0, b=3
x=2.5, vx=+1, ell=0.5, g=-1, B=+2, Bdot=0
emf_m=+2 V, I=+1 A, F_Bx=-2 N, P_J=+2 W
```

**F - Static-B free damping exact reference**

```text
m=1, N=1, h=1, w=1, R=2, B=+2, a=0, b=3
x(0)=-0.5, vx(0)=1, no external force, circuit closed
Until the loop finishes entering: gamma=N^2*h^2*B^2/(m*R)=2 1/s
vx(t)=exp(-2t)
x(t)=-0.5+(1-exp(-2t))/2
K(t)=0.5*exp(-4t)
Q_J(t)=0.5*(1-exp(-4t))
W_ext=0, W_transformer_source=0, K(t)+Q_J(t)=0.5 J
At t=0.5: vx=exp(-1), x=-0.5+(1-exp(-1))/2
```

**Additional mandatory properties / table cases:**

- Open circuit preserves total EMF but sets I/F_Bx/P_J/Q_J to zero; unforced loop moves uniformly.
- Stationary loop in variable B gives no motional EMF.
- B=0 but Bdot!=0 yields transformer EMF with F_Bx=0; signed finite current.
- Static B reversal flips EMF/current but keeps opposing force at fixed vx; for reversing an entire B(t) history, the decomposed EMFs flip and the force symmetry is checked.
- N scaling: EMFs and I linear in N; net F_Bx proportional to N^2 if geometry/B/v and R stay fixed.
- Geometry `w > b-a` and coincident thresholds produce correct overlap and no duplicate events.
- Start exactly on strip boundary with inward/outward/tangent motion; one-sided slope selection and finite forward event time.
- Velocity reversal while moving loop is in field; signs of current and magnetic force update without timeline reset.
- Time-varying dynamic mode independently satisfies integrated energy equation; use multiple cases where `W_transformer_source` has either sign.
- Piecewise continuous B(t) with knot has left/right derivatives; no fabricated unique derivative at the knot.
- Manual B rate limiter: monotonic event times, known slope bounds, no change while paused, correct continuous loop response.
- Manual x gesture: consistent signed vx and EMF; stopped finger -> current relaxes according to actual Bdot; retained Q_J/history; cancellation of second pointer does not generate huge speeds.
- Fine integration resolution vs coarse integration and different visual chart sampling yield convergent states and identical physical boundary-event order; independent energy/work integration converges.
- Damage/overflow/invalid JSON, zero/negative R, m, h, width, N fractional, nonfinite values produce explicit issues, never NaNs or hidden clamps.
- Existing expression parser tests: exact `sqrt(2)`, `1/3`, pi, scientific notation, >slider range and malformed expressions; invalid entry does not alter physics or playback.

Set tolerances separately by class: analytic algebraic 1e-10 or better for moderate values; dynamic state/energy error-controlled to a documented relative/absolute budget (e.g. 1e-6 for ordinary pedagogical presets), tighter when practicable. Never promise universal absolute tolerances over arbitrarily scaled user parameters.

## 10. Code architecture and suggested files

Adapt to actual repo conventions, but prefer:

```text
src/physics/induction/movingLoopTimeField.ts   # overlap, signs, snapshots
src/physics/induction/coupledLoopDynamics.ts    # adaptive solver, event location
src/simulations/induction/i05Params.ts          # safe units, presets, validation
src/simulations/induction/i05Scene.ts           # state, runtime, versioned JSON
src/simulations/induction/CoupledLoopPage.tsx   # student/teacher controls
src/simulations/induction/CoupledLoopStage.tsx  # touch scene
src/components/CoupledLoopCharts.tsx            # grouped linked charts
src/content/lessons.ts                          # I05 lesson
src/content/questions.ts                        # I05 originals
src/simulations/registry.ts                     # /induction/coupled-loop
src/app/App.tsx                                  # lazy route
src/pages/HomePage.tsx                          # real model card
tests/physics/movingLoopTimeField.test.ts
tests/physics/coupledLoopDynamics.test.ts
tests/physics/i05Scene.test.ts
tests/tablet/i05.spec.ts
```

Separate analytic geometry/EMF snapshot from numerical mechanical dynamics. Prefer existing `usePlaybackClock`, I03 geometry/event utilities, I04 B-time timeline, I02 gesture tracking, existing chart stack, route lazy-loading, scene v2 persistence/export/import and Round 11.5 ParamSlider. Do not copy large existing modules merely to save integration effort. If using a new numerical dependency, justify its footprint and error controls; otherwise implement and test a compact deterministic solver.

Persist parameters and mode, **not** an unbounded manual input history. Export/import bounded, sanitized scene configuration with versioned migration. If manual B history is exported, define a separate bounded and validated session-log schema, not arbitrary executable text. On refresh, show a clear reconstructed t=0 experiment unless explicit replay support has been implemented; never imply uninterrupted continuation.

## 11. Tests, QA, and performance gates

### Automated gates

1. `npm run typecheck` - clean.
2. `npm test -- --run` or repo's actual full Vitest command - all existing plus new tests pass.
3. `npm run build` - clean, model chunk loaded only when needed.
4. `npm run test:tablet` or `npx playwright test` - complete existing suite and I05 tests pass without omissions.
5. `npm run test:pwa` - production SW install, offline I05 open, at least one mode switch, parameter edit and an original question; existing 11 models remain offline-accessible.

Baseline from user report was 388 Vitest + 117 Playwright + 2 PWA. Verify actual current numbers; do not reduce coverage or suppress failures. Add at least 20 focused I05 physical/property checks, 6-10 I05 browser interactions and integration/content/PWA checks, but quality matters more than padding test counts.

### Tablet flows to automate

- 1194x834 and 768x1024 at minimum; more existing viewports continue.
- Student launches M1, sees overlap and signed EMFs; enters `sqrt(2)` and `1/3` in physical controls; slider still works and valid out-of-range expression is not clamped.
- During M3 playback, move B handle for several pointer events: global time increases, B ramp is continuous, x and vx respond, energy history updates; pause must not record new physical B events.
- During M4 playback, move loop into/out of strip: track position and current sign; a second touch cancels a draft without giant velocity spikes.
- M2 static B free damping, energy residual, boundary event and model pause/seek/step behavior.
- Open loop: EMF readout remains, current/force/heat disappear; correct stage arrows.
- Practice question opens correct I05 experiment preset and returns without losing broader learning progress.
- Offline revisit I05, save/restore config, export/import and damaged JSON handling.
- No horizontal overflow, unobstructed focus with soft keyboard in emulated touch environment; do not label emulation as real hardware.

### Performance instrumentation

Measure using **production preview**, not a dev-only server, and record machine/browser/viewport and sampling protocol. At minimum inspect M2 high-frequency B, M3 manual ramp, M4 touch history and chart-heavy teacher view. Compare frame intervals, p95/p99, JS heap and chart update cost with I02/I04 when feasible. Use selective memoization/decimated display samples/virtualized charts while keeping ODE/event/energy precision intact. Do not market rAF >60fps in headless Chromium as proof of 60fps on real tablets.

### Real-device status

If no physical iPadOS Safari or Android Chrome is connected for direct testing, mark all true-hardware criteria `NOT_TESTED`. Prepare an actionable checklist: touch and second-finger cancellation, soft keyboard and mathematical shortcuts, orientation and safe areas, offline install after HTTPS deployment, background recovery, 15-minute thermal run, screen-reader labels and dynamic font-size. Do not claim genuine tablet acceptance from CDP.

## 12. Teaching + QA documentation and model matrix

Update all existing project docs as appropriate:

- README (I05 route, modes, how to run, user guidance).
- REQUIREMENTS (the coupled-loop live-physics semantics).
- CONTENT_MAP (topics, 8+ lesson steps, practice mapping).
- PHYSICS_SPEC (coordinate/sign/energy formulas, numerical ODE, tested anchors, undefined derivatives).
- DECISIONS (rationale for numerical solution, field-source energy, treatment of externally imposed motion, event policy).
- MODEL_COMPLETION_MATRIX (I05 to COMPLETE **only when all acceptance gates truly pass**; other statuses unchanged).
- PARAMETER_INPUT_AUDIT (new I05 physical numeric controls audited).
- QA (test commands, counts, screenshots, accuracy, performance, limitations, real-device NOT_TESTED).
- AGENT_HANDOFF (new responsibilities and follow-up advice).

Protect original exam reference statuses; do not publish or fabricate exam-paper content. New questions must be original with checkable answers and data mapping to real simulations.

## 13. Delivery report required from Codex

After implementation, report concretely:

1. Actual files changed, new route and 4 mode entry points.
2. Which existing physics/clock/gesture/math-input facilities were reused.
3. EMF and net magnetic force sign audit, exact anchors A-F with observed test results.
4. Energy-balance residual samples, event accuracy, convergence table, known numerical limits.
5. Screenshots: static B entering, dynamic B, cancellation, full overlap, open loop, manual B, manual x, chart/teacher view, tablet landscape and portrait.
6. Exact commands and true results: typecheck, unit tests, browser, build, PWA. Clearly separate previously reported vs just executed.
7. Bundle sizes and production-preview performance with context; do not claim real-device FPS.
8. Explicit gaps: genuine iPad/Android test, HTTPS deployment, licensed real exams, self inductance, field back-reaction, etc.
9. Updated 16-model matrix, with I05 and I06 marked COMPLETE only after each independently passes its acceptance gates; report remaining I07/P08/I08 work.

**Start coding after repository audit.** Do not stop at a design memo. Do not generate a separate disconnected demo. This is only the I05 portion; continue to mandatory I06 and joint delivery requirements below.

## 14. Source references (background, not a license to reproduce textbook content)

The moving-loop flux rule and its combined field/motion EMF are standard electromagnetic induction results; references for technical cross-checking:

- Cambridge, David Tong, *Electromagnetism*, section on moving circuits: https://www.damtp.cam.ac.uk/user/tong/em/el3.pdf
- OpenStax, University Physics Volume 2, 13.3 Motional Emf: https://openstax.org/books/university-physics-volume-2/pages/13-3-motional-emf
- MIT, Electromagnetic Field Theory, induction in moving media: https://ocw.mit.edu/courses/res-6-002-electromagnetic-field-theory-a-problem-solving-approach-spring-2008/

Keep all authored instructional content and exercises original; verify equations independently through unit tests.


---

# PART B - I06: Dual Conducting Rods on Parallel Rails

## B0. Teaching goal, scope and canonical setup

I06 is not a duplicated I02 moving-rod page. It demonstrates a **closed circuit formed by two independent movable conducting rods and ideal parallel rails**, making the two rods dynamically coupled by a single induced current. High-school insights: relative velocity determines EMF, interaction forces oppose relative motion, total momentum is conserved when no external forces act, mechanical energy becomes Joule heat, forces/positions approach a shared center-of-mass velocity, and external drives can reverse current or induce contact.

**Ideal setup**: two straight parallel rails along x at y=0 and y=L; conducting rods 1 (left, x1) and 2 (right, x2), always x1 < x2; uniform static prescribed Bz through the x-y plane, zero motional rail EMF; nonmagnetic rigid rods constrained to slide without friction and maintain contact. One loop is closed through the two rods and both rails. Masses m1,m2>0, rod/contact/external resistance total R=R1+R2+Rrail+Rexternal>0. No self-inductance or capacitance, no magnetic field back reaction, no mutual particle-like electric forces, no rod bouncing, no external collision loss folded into Joule heat. Rods can have different masses, drag coefficient is set by shared circuit, not assigned independently. The field is static for I06; time-varying B belongs to I05 and any I06 time-dependent expansion is future scope.

**Required experiments within one I06 page:**

1. **D1 - Unforced/free two rods**: configurable v1(0),v2(0), masses, B, L, R; both rods evolve according to mutual magnetic forces with exact analytic solution before a geometry stop. Show how relative speed decays and the two velocities converge.
2. **D2 - Prescribed constant external forces**: independent signed F1 and F2, exact analytic solution for two-rod coupling with constant external forces. Show common-mode acceleration, differential dynamics, force reversal and energy accounting. Zero force reproduces D1.
3. **D3 - Circuit/field comparisons**: switch ideal loop open/closed and B sign/magnitude, demonstrate that moving together at the same velocity yields zero net EMF although both rods move; open loop has EMF but no current or magnetic coupling; negative B reverses I but not the magnetic damping effect.
4. **D4 - Hand-driven rod with the second rod clamped**: continuously drag rod 1 or 2 while the other is visibly **externally held fixed**; display signed estimated hand velocity, EMF, I, forces, instantaneous power and historical heat using monotonic event samples. No full free-dynamics energy-conservation claim for arbitrary hand motion. Optional later: free second rod coupled to hand-driven rod, but only if a verified ODE is added and explicitly labeled. Do not silently model a fixed rod as freely moving.

I06 must have its own teachable stage and no fake multi-particle roster. An optional single-rod I02 comparison link is useful; I06's two rods represent two parts of ONE circuit.

## B1. Coordinates, signs, forces and derived equations (contract)

Use +z out of screen; Bz>0 is dot; current I>0 flows CCW as seen from +z. The loop boundary in CCW order: bottom rail from rod 1 to rod 2, rod 2 upward, top rail from rod 2 to rod 1, rod 1 downward. Define d=x2-x1>0, deltaV=v2-v1, total mass M=m1+m2. Magnetic field is externally prescribed and spatially uniform. Valid closed-circuit formulas:

```text
A = L * (x2 - x1)
Phi = Bz * L * (x2 - x1)                       # single loop, N=1
epsilon_1 = +Bz * L * v1                       # left rod contribution
epsilon_2 = -Bz * L * v2                       # right rod contribution
epsilon_total = epsilon_1 + epsilon_2
              = -Bz * L * (v2 - v1) = -dPhi/dt
I = epsilon_total / R                          # closed circuit
I = 0                                          # open circuit
P_J = I^2 * R                                  # closed circuit
F_B1,x = -I * Bz * L                           # left rod magnetic force
F_B2,x = +I * Bz * L                           # right rod magnetic force
k = (Bz * L)^2 / R                             # nonnegative coupling
F_B1,x = +k * (v2 - v1)
F_B2,x = -k * (v2 - v1)
```

Open circuit: EMF contributions still exist, but I=0, F_B1=F_B2=0, P_J=0; mechanical motion follows only external forces. Bz=0 follows the same zero-coupling limit. If both rods move right with the same velocity, epsilon_1 and epsilon_2 are opposite but their sum is exactly zero: no current and no magnetic force. For negative B, both EMF and current change sign but k and the opposing-relative-motion forces do not.

Never apply the single moving rod `epsilon=B L v` to **either rod alone as the net circuit EMF**. Do not draw opposite induced currents in the same closed circuit. The magnetic field does not do net mechanical work *independently* of the circuit; the mechanical power lost by both rods must match I^2 R in the closed static-B case:

```text
P_B1 + P_B2 = F_B1*v1 + F_B2*v2
             = -k*(v2-v1)^2
             = -I^2*R = -P_J
P_external = F_ext1*v1 + F_ext2*v2
dK/dt + P_J = P_external
K - K0 + Q_J - W_external = 0
momentum derivative: d(m1*v1 + m2*v2)/dt = F_ext1 + F_ext2
```

Use independent numerical quadrature or exact analytical Q_J to test energy; never define heat as a remainder that forces the error to zero. Keep the instantaneous signed total EMF and individual rod contributions visible in the teacher data panel. Rod current direction must agree with the same I sign on both sides of the loop.

## B2. Exact dynamics and analytic time evolution

Dynamics for closed circuit with independent prescribed forces F1(t), F2(t):

```text
m1 * v1dot = F1(t) + k*(v2-v1)
m2 * v2dot = F2(t) - k*(v2-v1)
x1dot = v1
x2dot = v2
```

For D1/D2 F1 and F2 are constant. Define:

```text
Vcm0 = (m1*v10 + m2*v20)/(m1+m2)
a_cm = (F1+F2)/(m1+m2)
alpha = k*(1/m1 + 1/m2)
source = F2/m2 - F1/m1
Vcm(t) = Vcm0 + a_cm*t
```

For alpha>0:

```text
DeltaV_inf = source/alpha
DeltaV(t) = DeltaV_inf + (DeltaV0-DeltaV_inf)*exp(-alpha*t)
DeltaX(t) = DeltaV_inf*t
            + (DeltaV0-DeltaV_inf)*(1-exp(-alpha*t))/alpha

d(t) = d0 + DeltaX(t)
v1(t) = Vcm(t) - m2/(m1+m2)*DeltaV(t)
v2(t) = Vcm(t) + m1/(m1+m2)*DeltaV(t)
Xcm(t) = Xcm0 + Vcm0*t + 0.5*a_cm*t^2
x1(t) = Xcm(t) - m2/(m1+m2)*d(t)
x2(t) = Xcm(t) + m1/(m1+m2)*d(t)
```

Use `expm1`-style stable evaluation of `(1-exp(-alpha*t))/alpha` for small alpha*t. For alpha=0 (B=0, open circuit), use the exact uncoupled constant-acceleration solution; do not divide by zero and do not create fake exponentially damped motion. For F1=F2=0 and k>0, center-of-mass velocity stays fixed, the relative speed decays exponentially, and total momentum remains constant.

The **two rods must never pass through each other** in the scene. Stop the pre-contact analytic solution at the earliest admissible d(t)=0, or at a documented minimum rod width/contact gap if that geometry is modeled; root-solve to a bracketed, independently verified time. Do not invent an elastic collision, force bounce or count impact energy as Joule heat. On contact, report `contact-stop` / `collision-not-modeled`, preserve pre-contact state and energy ledger, and freeze if physical continuation is undefined. If a screen-defined rail end exists, enforce explicit end-stop event with the same transparency. Contact can arise with rods closing at negative deltaV even as magnetic forces oppose closure.

For D4 manual drive, one rod's externally prescribed x(t) is authoritative and the other is fixed by a labeled clamp. Estimate hand velocity via existing I02 monotonic sample window with a bounded update cadence; total current/forces are calculated from actual relative speed. Record signed electric power and nonnegative accumulated heat; clearly distinguish a guessed or measured external constraint force from an exact Newtonian result. Stop hand-driven movement at rod contact (or refuse crossing) and show a boundary warning. If a second pointer cancels the gesture, safely discard/terminate without creating huge velocity spikes. Pausing stops new history, not playback time reset; use the project's existing manual-input semantics.

**No numerical RK is needed for constant forces** in D1/D2; using the analytic result is preferred. Any optional extended time-dependent forcing must use a verified solver and must not replace the required exact baseline.

## B3. Physics snapshots, rendering and teacher graphs

Provide independent pure calculation functions under `src/physics/induction/` and one I06 snapshot that drives stage, numerics, graphs, arrows and teacher layers. Adapt to real repository interfaces:

```ts
type I06Snapshot = {
  timeS: number;
  rod1: { x: number; v: number; a?: number; massKg: number };
  rod2: { x: number; v: number; a?: number; massKg: number };
  separationM: number;
  relativeVelocityMS: number;
  centerOfMassVelocityMS: number;
  fluxWb: number;
  emfRod1V: number;
  emfRod2V: number;
  emfTotalV: number;
  currentA: number;
  forceRod1N: number;
  forceRod2N: number;
  joulePowerW: number;
  kineticEnergyJ: number;
  totalMomentumKgMS: number;
  jouleHeatJ?: number;
  externalWorkJ?: number;
  energyResidualJ?: number | null;
  status: 'active' | 'open-circuit' | 'contact-stop' | 'invalid' | 'solver-limited';
  eventFlags: string[];
  approximation?: string;
  issue?: string;
};
```

Student interface in landscape: **one shared, large 2D rail-and-rod scene** (not two windows), with two independently labeled rods A/B or Rod 1/2. On-screen objects: both sliders on same two rails, a *single* current direction loop, B dot/cross glyphs, x1/x2, v1/v2, F_B1/F_B2, F1/F2 and current. Use 44px+ touch targets, active rod selection, one-finger handle movement in manual mode, two-finger pan/zoom and no gesture-induced page scrolling. In other dynamic modes, draggable **initial-condition handles** restart the experiment definition, not silently teleport a running rod while preserving its old physical state.

Toggleable grouped plots and synchronized cursor:

- x1(t), x2(t), separation d(t)
- v1(t), v2(t), DeltaV(t), Vcm(t)
- epsilon_1(t), epsilon_2(t), epsilon_total(t), I(t)
- F_B1,F_B2, P_J and external power
- K,Q_J,W_ext, independent energy residual; total momentum when no external force

Show analytic convergence of velocities and the exact point of first contact. Avoid cluttering the stage with all graph series at once; use existing chart grouping and teacher overlays. Mobile portrait uses a large scene on top, collapsible controls and history. Display a plain-language legend for the sign and circulation conventions.

Include switchable layer masks for instantaneous current, opposing forces, rod EMF contribution, flux, total momentum, mechanical-to-thermal energy and event annotations. Keep all calculations in one authoritative physics state rather than performing sign logic inside SVG components.

## B4. Parameter inputs, persistence, routes and reuse

- Use existing Round 11.5 `ParamSlider` with valid out-of-slider mathematical expressions for Bz, L, R components/total R, m1, m2, v10, v20, x10, x20, F1, F2, time window, manual target if numeric, and any additional physical numeric control.
- Validate positive masses, rail spacing and Rtotal, x1<x2, valid field and velocities, nonfinite values, stable range, dimensions and explicit event limits. Never silently reorder rods, clamp a valid mathematical input to a slider min/max or round fractional values. If user enters invalid geometry, preserve the previous valid experiment and show an actionable message.
- Preserve units and full double precision internally. Input of `sqrt(2)` and `1/3` is required; do not fork the parser. An exact decimal preview is a numerical approximation, not a change to the original expression.
- Persist versioned scene v2 (or current verified schema version) with modes/parameters/teacher layers. Export/import sanitized JSON, stable names and strict size caps. Do not export unbounded manual movement history as if it were trusted configuration. Refresh reconstructs t=0 unless replay was implemented.
- Register real route `/#/induction/dual-rods` (or conform to actual route conventions), model registry, home card, learning, practice filter, question launch preset and progress. Lazy load page/charts; no Three/R3F dependency in I06.
- Reuse I02 rod drawing and sign-calculation utilities when possible, I05/I01 flux display conventions, shared clock and manual drag/timeline utilities; keep rod-coupling pure physics separate from React and do not make I05 depend on I06.
- Keep existing 11 completed model routes, P01 WebGL, I04/I01 continuous control, P02/P03/P06/P07 multi-particle editing and math parser intact.

## B5. Mandatory numerical/analytical anchors for I06

The independent tests below use SI units, and all clocks start at t=0. Expect algebraic checks at ~1e-10 relative/absolute where scales are moderate and event-time checks at ~1e-8 or better if feasible. Do not apply a single fixed absolute tolerance to extreme parameter magnitudes.

**R1: Two free rods, symmetric example.**

```text
m1=m2=1 kg; Bz=+1 T; L=1 m; Rtotal=2 ohm;
x1(0)=0 m; x2(0)=3 m; v1(0)=0 m/s; v2(0)=2 m/s;
F1=F2=0.
k=0.5 kg/s, alpha=1 /s, Vcm=1 m/s.
DeltaV(t)=2*exp(-t)
v1(t)=1-exp(-t); v2(t)=1+exp(-t)
x1(t)=t-(1-exp(-t)); x2(t)=3+t+(1-exp(-t))
d(t)=3+2*(1-exp(-t))
epsilon_total(t)=-2*exp(-t) V
I(t)=-exp(-t) A
F_B1(t)=+exp(-t) N; F_B2(t)=-exp(-t) N
K(t)=1+exp(-2*t) J
Q_J(t)=1-exp(-2*t) J
P_total(t)=m1*v1+m2*v2=2 kg*m/s
K(t)+Q_J(t)=2 J
```

Assert at t=0,1,2; k/alpha, signed EMF, forces, velocities, positions, momentum and energy. A nontrivial `Q_J` must be independently integrated or evaluated from the exact expression.

**R2: Same-speed translation, no induced current.**

```text
v1=v2=+3; Bz=2; L=1; R=2; F1=F2=0
DeltaV=0, epsilon_1=+6 V, epsilon_2=-6 V,
epsilon_total=0, I=0, F_B1=F_B2=0, Q_J=0,
d(t)=d0 while both rods translate at v=3.
```

**R3: Magnetic field reversal.** Reverse Bz in R1 but keep all other values: I and both individual EMF contributions reverse sign; trajectory, mechanical forces, momentum and Q_J remain identical.

**R4: Open circuit and zero-field degeneracies.** At v1=0,v2=2,B=1,L=1, open-circuit EMF=-2 V, I=F_B1=F_B2=Q_J=0; both move at their prescribed initial constant speeds if F1=F2=0. At B=0, flux/EMF/I/forces vanish, motions reduce to free/externally accelerated rods. Stop at rod contact if positions cross; do not show fake rail crossing.

**R5: Rods approaching contact with a finite analytic collision time.** Use m1=m2=1, B=1, L=1, R=2, x1(0)=0, x2(0)=1, v1(0)=2, v2(0)=0, F1=F2=0. Then `d(t)=1-2*(1-exp(-t))`, first contact `t=ln(2)`, and immediately before contact `v1=1.5`, `v2=0.5`, `K=1.25 J`, `Q_J=0.75 J`. At and after the stop, do not let d<0 or invent elasticity/heat.

**R6: Unequal masses.** Choose m1=1,m2=3,B=1,L=1,R=2,v1=0,v2=2,F1=F2=0. Then `Vcm=1.5`, `alpha=(1/2)*(1+1/3)=2/3` and `DeltaV=2*exp(-2*t/3)`; at each test time v1/v2 reconstructed from Vcm/deltaV and total momentum=6.

**R7: Opposite external constant forces and energy.** Use m1=m2=1,B=1,L=1,R=2,v10=v20=0,F1=+1 N,F2=-1 N, choose initially ample rod separation and test before contact:

```text
alpha=1, Vcm=0
DeltaV(t)=-2*(1-exp(-t))
v1(t)=+(1-exp(-t)), v2(t)=-(1-exp(-t))
K(t)=(1-exp(-t))^2
Q_J(t)=2*[t - 2*(1-exp(-t)) + (1-exp(-2*t))/2]
W_ext(t)=2*[t - (1-exp(-t))]
K(t)+Q_J(t)-W_ext(t)=0
```

Assert impulse: total momentum remains zero because F1+F2=0. Check each force's sign and P_J>=0.

**R8: Equal-speed nonzero applied common force.** For F1/m1=F2/m2=a, initial deltaV=0, both velocities stay equal while accelerating at a (provided both remain on rails), I=0; center-of-mass motion follows constant acceleration. Contrasts common-mode acceleration with relative motion.

**R9: Direction current/force checks.** v2>v1 with Bz>0 => I<0; left rod magnetic force points +x, right points -x. v2<v1 => reverse. Opposite B reverses electrical current but not magnetic opposition to deltaV. Net magnetic force and net magnetic impulse of the pair are zero.

**R10: Boundary, invalid input and stability.** Start x1<x2 very close; detect first contact before overlap without spurious NaN; reject m<=0,L<=0,Rtotal<=0, nonfinite x/v/B/F and invalid resistance parts. Test alpha->0 via small B / huge R, x1<x2 invariant, no false contact for deltaV>=0, and display sampling invariance (30 vs 300 points yields the same analytical contact time).

**R11: Manual drag time-series.** In D4 set rod 2 clamped at x2=3, move rod 1 right with irregular timestamps to produce v1>0; assert epsilon_1 positive for B>0 and I positive (for v2=0), forceRod1=-I*B*L opposes the drag; history accumulates nonnegative heat. Hold finger still and verify v1, I and P_J return to zero (static B). Cancel via second finger; no giant dt velocity spike or leaked movement into x1>=x2.

**R12: Expression input + signed units.** `Bz=sqrt(2)` and `Rtotal=1/3` accepted when within physical/stability domain even outside slider range; `1/0`, sqrt-negative, fractional mass policy conflicts, NaN and illegal syntax rejected. Parse errors never alter the previous valid trajectories or accumulated clock. Unit conversion round-trips must preserve numerical precision.

Test differential identities with finite differences away from endpoints: xdot_i=v_i, m_i*vdot_i=F_ext_i+F_Bi, `dPhi/dt=-epsilon_total`, `dK/dt+P_J=P_external`, `F_B1+F_B2=0` and `Q_J>=0`.

## B6. I06 lessons, presets and original questions

At least eight reproducible named presets spanning opening speed difference, same-speed null EMF, opposite directions, B reversal, open circuit, unequal masses, contact-stop, equal/opposed external forces, manual rod and zero B. Presets must be actual model states, not static illustrations.

Provide >=8 lesson steps covering: loop orientation; flux and relative motion; individual rod EMFs; single shared current; magnetic forces and Lenz damping; center-of-mass momentum; velocity equalization and exact exponential evolution; Joule energy and external work; collision boundary; how to solve high-school exam-level dual-rod questions.

Provide >=8 **original** high-school-style questions with tiered hints, authored verified answers and stable IDs: at least 2 numerical problems and 2 conceptual/multiselect questions. Include an equal-velocity trick, a momentum + energy question, unequal mass and changing current direction cases, one contact-stop limitation, and one external-force power budget. Question -> exact preset -> experiment -> return to question must work offline. Never invent exam-paper originals or mark source links verified without independent evidence.

## B7. I06 UX, QA and performance acceptance

Create focused physics and scene tests (>=20 substantive assertions across at least 12 independent anchored cases), and at least 6-8 tablet browser scenarios. Required flows:

1. Two moving rods on the *same* rails, signed EMF and force arrows; one speed changed through math expression, new physically correct paired trajectory.
2. Free two-rod motion: v1 and v2 converge, momentum constant, energy split correct.
3. Same-speed control: rods translate, current is zero, stage does not show fabricated magnetically braking rods.
4. Rods approach and reach contact: stop at exact time, do not cross or add collision heat.
5. Open circuit: EMF persists while I/F_B/Q_J=0.
6. Constant external force: analytic state and independent energy residual, current sign changes when relative speed crosses 0 if a preset supplies that condition.
7. Hand drag: simulation clock continues; rod 2 physically clamped; single-finger input changes v/current; second finger cancels safely; gesture doesn't scroll the page.
8. Offline I06 route and question links, versioned import/export/corrupt input, 1194x834 and 768x1024 layout, grouped charts + teacher visibility.
9. Round 11.5 safe-math input for every physical numeric field, including B/speeds/forces/resistance, plus original slider access and invalid input recovery.

Use browser emulation honestly; mark real iPad/Android verification `NOT_TESTED` unless actually performed. Performance check **production preview** with chart-heavy I06 teacher mode and D4 touch; report rAF interval p95/p99 and JS heap, don't equate headless fps with genuine tablet refresh rate.

---

# PART C - One-Round Integration / Execution / Acceptance

## C1. Implementation sequence and optional parallelization

**Phase 0 - Repo verification:** inspect paths, dependency versions, registry, actual test scripts, currently shipped model list, input spec, saved scenes and shared clock; record baseline counts from a fresh run when affordable. Treat this document as the task contract and existing project docs as a source of interface truth; resolve discrepancies before implementing to avoid a second app architecture.

**Phase 1 - Two physics cores in separate scopes:** I05 pure snapshot + coupled ODE + boundary/energy + independent anchors; I06 pure dual-rod analytic solver + contact + energy + independent anchors. Both may proceed in parallel in separate file scopes or worktrees if Codex supports it; otherwise do sequential physics modules. Avoid jointly editing the same shared integration files.

**Phase 2 - Two functional vertical slices:** I05 controls/4 modes/charts/teacher + I06 2-rod controls/4 modes/charts/teacher, each with tablet gestures and a working learning flow. Use separate new page/stage/scene/params/modules. Reuse existing clock, Round 11.5 math input, SVG stage patterns, chart utilities and offline data access. Physics must remain independent of rendering.

**Phase 3 - Single serialized integration:** one integration owner updates registry, App lazy routes, Home, content lessons/questions, question counts, content schema, practice filters, QA, docs, import/export schema and service worker config. Avoid merge conflicts and duplicate question IDs.

**Phase 4 - Mandatory full verification:** run both new physics suites, full Vitest, typecheck, build, Playwright full suite and production PWA offline. Inspect screenshots in tablet landscape and portrait. Fix root cause, never weaken or skip old assertions; document genuinely flaky/environmental failures.

**Phase 5 - Honest delivery:** update model completion matrix: I05=COMPLETE and I06=COMPLETE only if all functionality actually works with tested physics and browsing. Otherwise mark the exact incomplete module as PARTIAL and explain why. Do not claim a successful dual-module round if only one passes.

## C2. Cross-module consistency checks

- Reuse one +z field and CCW sign convention across I01-I06, especially the distinction between single-turn flux and N-turn linkage in I05, and a single moving rectangular loop defined by two rods in I06.
- I05 transformer EMF plus motional EMF and an **external B(t) source power**; I06 static B, relative-speed EMF, mechanical-circuit Joule conversion, **no transformer source**. Do not copy the I05 energy ledger wholesale into I06.
- In both models distinguish user-controlled imposed motion (external constraint) from genuinely dynamic free evolution; only show exact energy residual where the model actually accounts for its sources and motions.
- A valid math-expression input beyond slider range must be used without slider clamping for both new modules. Invalid/incomplete math text leaves prior physical state and clock untouched.
- Both are circuit/rigid-body models; **do not use P02's 1-5 particle A-E roster**. I06 has two actual rods that are dynamically coupled; do not create two independent single-rod experiments.
- Both use actual simulator time for field updates, motion, numerical integration, and energy history; chart sampling frequency must never change underlying physics.
- Use bounded histories; robust storage migration; graceful invalid inputs, zero B, open circuit, low speed, contact, time-window and ODE limit failures. Never display NaN/Infinity, fake velocities, fake event times or false work conservation.

## C3. Scope, measurable quality gates and final report

**Required deliverables for EACH model:** new working route, pure physical engine and tests, 4 meaningful modes, 8+ step lesson, 8+ original exercises with solutions/hints, >=8 presets, touch-first stage, teachers' diagram/data layers, chart groups, expression-enabled numeric input, state v2 persistence, import/export, offline access, docs and screenshots.

**Full project target:** 13 functioning models (prior 11 + I05 + I06), at least 108 original exercises (prior 92 + 8 + 8), with current count verified from repository. No need to invent counts if an existing branch differs.

**Tests:** full pre-existing baseline reportedly 388 Vitest, 117 Playwright and 2 PWA after Round 11.5; these are historical reports, not claimed current numbers. All must remain and new checks added. Ensure no excluded files, `test.only`, artificial status toggles or reduced tolerances to hide failures.

**Required recorded QA:** I05 anchor A-F and convergence/field-source power; I06 anchor R1-R12, contact event, momentum, heat/work identity; screenshot evidence for both under landscape and portrait; commands and exact counts for typecheck, test, build, tablet, PWA; routes and file list; bundle/chunk sizes; production-preview runtime context and memory/long frames; status of real iPadOS/Android and public HTTPS (`NOT_TESTED` where true); rights/verification status for exams.

**Do not** start I07, P08 or I08 in this round; do not attempt a major WebGL overhaul or unrelated architectural refactor. If a common helper emerges from these two modules, extract it only if it passes existing regressions and makes semantics clearer.

Update README, REQUIREMENTS, CONTENT_MAP, PHYSICS_SPEC, DECISIONS, QA, MODEL_COMPLETION_MATRIX, PARAMETER_INPUT_AUDIT and AGENT_HANDOFF, adapting actual repo paths. Keep EXAM_SOURCES verification flags unchanged. Mark licensed authentic exam items only when rights and independent solution checks have actually been completed; otherwise all new practice is explicitly original.

**Stop condition:** the round ends only when both I05 AND I06 are fully implemented and all verifications completed, or when a real blocker is clearly reported with an honest PARTIAL status; never silently omit a module. Start coding in the existing repository after the audit, not in a separate demo, and do not stop at a planning document.
