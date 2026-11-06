# EM Physics Lab — Round 15 Full Implementation Brief

**Theme:** Gaokao problem-to-experiment teaching + tablet-ready HTTPS delivery

**Date:** 2026-11-04  
**Status:** Implementation specification for Codex; no code in this brief is claimed implemented  
**Priority:** Two parallel deliverables of equal importance, integrated in one full regression  
**Audience:** Senior secondary students preparing for Heilongjiang physics Gaokao; teacher-led and independent tablet learning  
**Language:** Student/teacher product interface and lessons in Simplified Chinese; code identifiers may remain in English

---

## 0. Actual project baseline and non-negotiable constraints

Use **the real repository** as the source of truth. The numbers below are from the user's Round 14 report and **must be verified in the repo** before claiming success:

- 16 COMPLETE runnable models: P01–P08 and I01–I08; 132 original questions.
- Learning paths at `/#/path` and `/#/path/:pathId/:modelId`; lessons, teacher layers, model-specific practice and deep links.
- P01 true WebGL 3D, optional fallback; the rest of the established 2D simulations.
- P02/P03/P04/P05/P06/P07/P08 support 1–5 independent particles where applicable; `tGlobal`, per-particle `launchTime`, single-particle live edit, shared-field reset semantics.
- Existing time-continuous manual induction modes; slider **plus safe mathematical expression input** with fractions, roots, pi and scientific notation in all models.
- Hash routing, lazy loading, local persistence and import/export, offline PWA.
- Reported regression baseline: `npm run typecheck`, **521 Vitest**, **159 Playwright**, **2 PWA tests**, and production build passing.
- No actual iPadOS Safari or Android Chrome hardware acceptance; no public HTTPS deployment; existing high-school exam references remain `verifiedOnline: false` unless proven otherwise.

**Do not regress:** Any existing simulation or learning-path function, physical sign convention, numerical tolerance, touch semantics, answer/progress storage, PWA route, offline asset, accessibility mechanism, 3D fallback, or mathematical expression parser. Do not delete, skip, relax, or reinterpret old tests to force a green result. New test counts should grow appropriately.

**Scope decisions for this round:** Do **not** add P09/I09 or rebuild the 16 physical solvers. Do **not** add accounts, payments, analytics uploads, an unrestricted user-script evaluator, or scrape/rehost copyrighted exam question banks. Do not claim full real-device acceptance or a public URL without checking it.

---

## 1. Goals, deliverables, release gates

### Track A — From physics problem to interactive experiment

A1. A dedicated *题目实验* (problem experiment) experience in the existing app, not a link list or standalone fake demo. A student can start from a **verified original** exam-style exercise or a **source-only reference** to a real exam, inspect stage-by-stage assumptions, launch a model preloaded with precisely mapped parameters, interact, return to their question and see the reasoning.

A2. Build a **typed, validated, data-driven `ProblemCase` catalog** independent of problem text rendering. Include provenance / authorization states and truthful model coverage (`exact_model`, `partial_stage`, `concept_illustration`, `unsupported`). No unsupported claim of reproducing an entire Gaokao paper using a model that only covers one movement segment.

A3. Deliver **at least 6 fully authored, original high-school-exam-style case studies** (at least 3 particle/field and 3 induction; at least 2 multistage; include at least one critical/tangent or multiple-outcome case). Each has independently verified solution, dimensional analysis, a reproducible simulation configuration, one or more teacher interventions, and parameter variations. Label these as **原创高考风格练习**, never as actual exam papers.

A4. Audit the existing exam index (including the 2024–2026 Heilongjiang-associated entries) and add a **source-backed metadata-only discovery list** where authoritative evidence can be found. Unverified content stays explicitly unverified. The app must not reproduce exact exam prompts/diagrams/answers unless rights have been checked and documented.

### Track B — Practical student tablet distribution and verification

B1. Make a **production-ready HTTPS deploy package** that a teacher can actually publish to a static hosting provider with no backend. If an authenticated target and permission are available, perform and verify staging deployment. If not, finish working deployment configuration, instructions and exact dependency/blocker; **do not invent a URL**.

B2. Provide reliable hash route handling, initial install/update behavior, offline return-to-case and lazy model resources, and safe local progress updates. Existing locally saved scenes, answers and exercises must survive app version updates.

B3. Implement a **device QA / diagnostic workflow** that gathers safe, local-only, user-consented diagnostics and records explicit *NOT_TESTED / PASS / FAIL / BLOCKED* per actual hardware scenario. CDP and headless measurements are labeled *SIMULATED*, never real iPad results.

B4. Improve the top classroom friction points discovered by the audit: touch target sizes, bottom-sheet form focus and virtual keyboard, scrolling vs canvas gestures, landscape/portrait safe areas, WebGL fallback on context loss, battery/performance-friendly visualization settings, and step-to-step navigation. Prioritize fixes evidenced by reproduction; no blanket UI rewrite.

**Definition of done:** Track A and Track B each have executable behavior, tests, documentation and screenshots, and all sixteen previous models still work. A working but unverified external paper is **not** a completed licensed exercise; a local `npm run preview` is **not** a public deployment; CDP touch is **not** real-device acceptance.

---

## 2. Mandatory repository preflight and audit artifacts

Inspect these *actual* files and current implementations first (filenames may differ; locate equivalents if necessary):

- `README.md`, `docs/REQUIREMENTS.md`, `docs/CONTENT_MAP.md`, `docs/PHYSICS_SPEC.md`, `docs/DECISIONS.md`, `docs/QA.md`, `MODEL_COMPLETION_MATRIX.md`, `AGENT_HANDOFF.md`, `ROUND14_MODEL_COVERAGE_AUDIT.md`.
- `src/app/App.tsx`, `src/simulations/registry.ts`, `src/pages/HomePage.tsx`, `src/pages/PracticePage.tsx`.
- Existing `src/content/{questions,lessons,schema,examReferences}.ts` or equivalents, `src/features/practice/PracticePanel.tsx`, existing `LessonRunner`, deep-link builders, PWA SW config, scene storage, import/export.
- `src/physics/particles/{uniformB,halfPlane,finiteMagneticRegion,alternatingMagneticRegions,crossedFields,segmentedFields,beamline}.ts` and representative `src/physics/induction/*`.
- `src/components/ParamSlider.tsx`, safe math parser, multi-particle scene controller, I01/I04 manual time behavior, P01 3D lazy stage, test scripts and Playwright configuration.

Create `docs/ROUND15_BASELINE_AUDIT.md` with: current routing and storage scheme, existing exam index and rights flags, closest reusable UI components, last actual tested counts, any code/simulation limitations and a work split showing no conflicting shared-file edits.

If parallel subagents/worktrees exist, Track A owns new case catalog, pedagogy and tests, Track B owns hosting/QA diagnostics and tests. The main agent alone integrates shared router, home navigation, global styles, PWA manifest and final docs. Otherwise execute sequentially. Never create a second implementation of the physics engines or the existing progress system.

---

## 3. Track A — Truthful source, provenance and copyright model

### 3.1 Two kinds of case — do not blur them

1. **`original_case`**: All prompt wording, diagrams and worked solutions authored specifically for EM Physics Lab. Full problem text may display and be cached offline. Label `原创·高考风格`; do not attribute it to an official exam.
2. **`exam_reference`**: A metadata record for a historical paper or question, potentially linked to official or third-party paper pages, **without reproducing protected full text, screenshots or solutions**. UI shows year, region, subject, question number *only when verified*, source link, provenance review state and matching conceptual models. When not verified, say `题号/原卷未复核` or leave the field blank. The source link need not be cached and may be unavailable offline.

Do not conflate `verifiedOnline` (a provenance flag) with `licensedForRedistribution` (rights). **Both must be independently satisfied before full copied material is exposed.** A found search snippet, copied online answer, or model-generated reconstruction is not authoritative evidence.

### 3.2 Proposed types (adapt to existing code; avoid duplicate content schemas)

```ts
type SourceKind = 'original_case' | 'exam_reference';
type VerificationStatus = 'unverified' | 'metadata_verified' | 'paper_and_solution_verified';
type RightsStatus = 'original' | 'link_only' | 'permission_granted' | 'unknown';
type MatchLevel = 'exact_model' | 'partial_stage' | 'concept_illustration' | 'unsupported';

interface Provenance {
  sourceKind: SourceKind;
  examYear?: number;
  examRegion?: string;
  questionNumber?: string;
  paperSourceUrl?: string;
  answerSourceUrl?: string;
  sourcePublisher?: string;
  checkedAt?: string;     // ISO, only when actually inspected
  verification: VerificationStatus;
  rights: RightsStatus;
  rightsEvidence?: string; // license / written permission / original authorship
  reviewNotes?: string;
}
interface CaseStage {
  id: string;
  title: string;
  modelId: string;        // must be one of the real 16 model IDs
  modelMatch: MatchLevel;
  limitations: string[];  // e.g. ignores fringe fields, nonuniform E
  sceneFactoryKey: string; // whitelist lookup, never execute external code
  parameterMappings: Array<{
    questionSymbol: string; modelParameter: string; units: string;
    explanation: string;
  }>;
  checkableObservables: string[];
  expected?: Record<string, { value: number; unit: string; tolerance: number }>;
  conceptualCheckpoint: string;
}
interface ProblemCase {
  id: string;
  title: string;
  provenance: Provenance;
  topicTags: string[];
  difficulty: 'basic' | 'advanced' | 'integrated';
  stem?: string; // allowed only for original or explicitly licensed content
  stages: CaseStage[];
  guidingQuestions: string[];
  reasoningSteps: string[];
  variations: string[];
  independentVerification: string;
}
```

Persist typed JSON only; sanitize imported case metadata and mathematical values. Never accept JavaScript expressions or arbitrary module/class names from deep links/JSON. Preserve existing scene v2 formats. Existing question catalog remains the source of truth for the 132 original exercises; these new guided case studies are **not automatically added to the count** unless registered and tested in the question system. Report guided case count and practice question count separately.

### 3.3 Verifiability rules for real exams

- Review existing `EXAM_SOURCES.md` and `examReferences.ts` without changing their flags preemptively.
- Search suitable authority/publisher sources where internet access exists. Capture an **exact retrievable URL**, source organization, paper identity, available page/date and independent answer validation notes. When official source cannot be located, say `third_party` or `not_found`; do not dress a third-party listing as an education-office publication.
- A reference is `metadata_verified` only if the paper/year/region and specific question identity can be checked directly. `paper_and_solution_verified` needs paper content inspection plus independently confirmed solution or hand derivation. `rights=permission_granted` needs actual authorization evidence.
- Distinguish 2024 / 2025 / 2026 exam-region labels exactly as printed on that year's paper; do not extrapolate a shared label across years.
- Publicly exposed metadata may link to legitimate external pages; any unlicensed text or answer remains external. The application's original questions must be original, not a cosmetically reworded photocopy or figure reproduction.
- Keep a machine-readable provenance table plus a readable `docs/EXAM_SOURCE_AUDIT.md` with unresolved links/questions and next evidence steps.
- Internet unavailable? Do not stall Track A: deliver 6 high-quality *original* guided cases and provenance workflow, leave exam links `unverified` honestly.

**Research lead, not official verification:** The 2025 黑吉辽蒙 question/answer PDFs appear on a third-party exam compilation page: `https://www.jhcee.cn/pc/gk_information/consultation_detail-d6278da9-0614-42f2-b955-956d684bd64c.html`. Treat it solely as a lead to investigate, not license or authoritative official answer. Course requirements should be cross-checked with current official curriculum materials where accessible.

---

## 4. Track A — Guided case catalog and reusable teaching UI

### 4.1 Six genuinely authored original cases (minimum)

At least three **particle** and three **induction** original cases; suggested coverage:

| Case | Primary model | What the student must discover | Independent verification basis |
|---|---|---|---|
| C01 half-plane/finite B | P03/P04 | Radius, boundary-exit angle, critical width and motion time | Circle-line intersections; compare with P04 analytic anchor |
| C02 alternating B and time | P05 | Geometry crossing vs simultaneous arrival; repeated boundaries | Exact segment events and tGlobal matching |
| C03 velocity selection + detector | P07 (with P06 concept link) | Pass vs absorb, B-analysis radius, final screen location | Piecewise analytic energy/kinematics, independently checked |
| C04 moving loop enters B | I03 | Flux ramp, EMF/current sign, forces and power | Piecewise overlap geometry and Faraday/Lenz |
| C05 changing B and moving loop | I05 | Induced + motional EMF contributions, possible cancellation | Product rule, power/energy independently verified |
| C06 opposite fields + wall | I07 (I06 concept link optional) | Opposite signed flux, rebound and Joule-vs-impact energy | Piecewise analytic events and energy ledger |

Do **not** make these a mere static reuse of unrelated existing questions. Each case must include an original problem statement, one clear mathematical objective, a prefilled simulated experiment for each stage, at least one moment where a student predicts before seeing the result, 4–8 steps of solution, at least 2 meaningful variations and a final comprehension check.

Build 2 or more truly multistage guided sequences. They may link successive compatible models; **never** claim that the app propagates a prior stage's final physical state unless the coordinate systems, units and continuity are actually validated. Otherwise use labeled `分阶段独立建模` steps and explicit resets.

Suggested exact anchor values, subject to real repo units/solver validation; use independently derived results in tests:

- **P04:** q=m=1, Bz=-1, r0=(0,0), v0=(1,0), strip 0≤x≤0.5: first right-edge event `t=π/6`, position `(0.5, 1-√3/2)`, velocity `(√3/2, 1/2)`.
- **P05:** preserve one verified alternating-zone anchor from the existing analytic test; compare true crossing timestamps. Do not copy an unverified time/position pair into new lesson text.
- **P07:** use the already tested 2026-style *original device* preset, verify screen hit against original independent formulas, and label original rather than an official question.
- **I03:** simple single-loop entry with fixed B and velocity can establish `ε=-B h v` for the signed orientation; verify against model convention (including N if present), never hardcode unsigned result.
- **I05:** at a valid overlap geometry with N=h=1, ell=0.5, B=2.5, Bdot=1, g=1, vx=1, R=2: `ε_t=-0.5`, `ε_m=-2.5`, `ε=-3`, `I=-1.5`, `P_J=4.5` (SI). The energy interpretation must include the field-source term where applicable.
- **I07:** use the existing validated `Φ=h(B1 ell1+B2 ell2)` and `S=B1 g1+B2 g2` setup; add collision energy check separately.

Where the existing solver's precise geometry makes a suggested anchor invalid, derive an **equivalent, explicitly documented** case and explain the change. Verification must not be self-referential: do not use `engineOutput` as the only expected answer.

### 4.2 The tablet learning interaction

Implement a coherent case route, e.g. `/#/cases` and `/#/cases/:caseId` (respect actual router) with **stepwise student experience**:

1. **读题/预测:** Show original problem text and diagram (self-authored SVG or simple geometry; no copied copyrighted diagrams). Hide final answer by default; teacher may toggle solution mask.
2. **建立模型:** Clearly map each question variable to physical scene values and units, show approximation assumptions and coverage label.
3. **实验探索:** One tap opens *the exact model with the case's scene factory data*, as a temporary case session. Preserve return path and last case stage.
4. **推导核验:** Show the independent derivation, numerical/closed-form answer, units, sign and expected observable after user chooses to reveal.
5. **变式迁移:** Change one meaningful parameter using the existing safe math expression input (`√`, `π`, fractions, beyond slider bounds where physically valid), then check the physics and student inference.
6. **返回/继续:** Return from simulation without destroying the student's unrelated saved personal model scene. Provide “重置到题目条件” explicitly; do not silently overwrite a scene they were exploring.

Maintain the same toolbar and portrait bottom-panel interaction conventions. Use accessible button names, focus restoration, keyboard navigability, touch targets ≥44 CSS px (or document equivalent hit areas), readable formula rendering and correct math in Chinese explanation. Long diagrams must not cover numeric inputs when the soft keyboard opens. No auto-scrolling the entire canvas while dragging model controls.

**Teacher mode:** answer masking, checkpoints, key geometry overlays from the actual solver, and 1-tap comparison of standard vs altered conditions. No hidden cheating answer view should be mislabeled as a secured exam mode; this is a learning tool, not a proctored testing system.

### 4.3 Deep-link behavior and local progress

- Static ID-only case deep links: `/#/cases/<caseId>?stage=<id>`, no arbitrary code or unbounded JSON in URLs.
- Case scene config comes from whitelisted typed fixtures. Use runtime validation; imported/malformed fixtures must fail safely.
- **Separate temporary case state from saved model state**. Entering a case cannot erase existing P07 multi-particle setups or I05 hand-drag histories.
- Store minimal local progress: visited step, revealed status (if appropriate), completion of conceptual check, last open case and return location. Version the store and handle old/invalid JSON.
- Existing 132 original question answers, favorites, mistakes, and learning path progress must remain intact.
- Offline first load requires a successful prior HTTPS install/cache; no claim that external exam source links work offline.

---

## 5. Track B — Static hosting and production-safe PWA

### 5.1 Minimum deployment deliverables

1. Audit the actual Vite bundling, PWA manifest, router base, service worker and lazy chunk navigation.
2. Add a documented **static HTTPS staging deploy path** for one suitable provider (e.g. Cloudflare Pages, Vercel, Netlify, or GitHub Pages) **consistent with the user's chosen host or the repo's existing tooling**. Prefer no new server or paid dependency.
3. Add reproducible scripts/config for clean install, build, local production preview and deploy/rollback instructions. Avoid hardcoding secrets, tokens or personal URLs; use platform environment variables as needed.
4. Verify correct base/path behavior for `/#/cases/...`, `/#/path/...` and all 16 `/#/...` model routes, manifest links/icons, direct/deep URL, offline reload, case content, imports, model 3D lazy assets and updates.
5. If authorized hosting credentials are already present and external actions are permitted, create a staging deployment and test actual `https://...` pages. Else produce a deployment-ready artifact/config plus `BLOCKED: hosting authorization unavailable` with exact user actions needed. Never say “deployed” without a verified live URL.
6. `README` should include a short **student-only** installation guide: open HTTPS URL on iPad Safari or Android Chrome, add to Home Screen (wording depends on OS), wait for first online cache, then offline use. Do not assume all browser/OS pairs support identical installation UI.

**PWA security:** Service workers require a secure context; `localhost` is a local development exception and `http://192.168.x.x` is not an ordinary equivalent. See MDN: `https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API`.

### 5.2 Offline and update correctness

- Test a fresh install on a clean browser context, followed by offline access to case catalog, an original case, one particle model, one induction model, a 3D scene if supported, and learning paths.
- On new build install, ensure users do not silently lose saved progress or scene v2 data; optionally expose a non-blocking `发现新版本 / 更新` notice, but no forced deletion of storage.
- Service worker handles lazy chunks and cache revisions correctly; no broken route after deployment path change, and no uncontrolled cache bloat.
- Source-only exam external links show an honest offline notice; do not cache copyrighted source PDFs implicitly.
- Corrupt or oversized imported JSON fails with a user-visible error and unchanged prior state.
- Do not introduce automatic server-side uploads of progress or device diagnostics.

### 5.3 Local-only device diagnostics and reproducible QA

Implement a lightweight on-device `课堂设备检测` / `device-check` page or a clearly discoverable section (non-production developer mode is acceptable if teachers can access it). It should report, as supported by the platform:

- date/time, user-entered device model and OS/browser version, landscape/portrait, approximate viewport and devicePixelRatio;
- secure-context / service worker / offline status; WebGL availability and context-loss recovery result;
- optional 60-second rAF frame-interval probe with p50/p95/p99 and frame count, **clearly labeled render scheduling proxy, not GPU FPS or physical device Hz**;
- a touch test checklist for particle control handles, pinch/rotate camera, velocity vector edits, numeric input focus and soft keyboard, background resume, scene persistence and restoring an original guided case;
- a manually fillable 15-minute warm-run checklist for heat / battery drain / Safari/Android session survival;
- keyboard/focus/VoiceOver/TalkBack checkpoint fields;
- export of a **privacy-safe JSON report** without question answers, precise location, IP, account data, student identities, or saved scenes. Export only from an explicit button click.

Statuses must be `PASS | FAIL | BLOCKED | NOT_TESTED` for physical devices; automated results use `SIMULATED_PASS/SIMULATED_FAIL` separately. No default `PASS` for any unrun manual check. If no real device is available, all hardware-only assertions remain `NOT_TESTED`.

### 5.4 Targeted touch/performance fixes (bounded)

Investigate and fix reproducible blockers only; preserve all physics calculations and user interactions. High-risk scenarios:

- P01 WebGL 3D first load / fallback / return from background / context lost;
- 5 particles with teacher vectors in P05/P07/P08; no global pause when editing one;
- I01/I04/I05/I08 continuous manual B/angle/time semantics;
- I02/I06/I07 direct touch drag / second finger cancellation;
- `ParamSlider` soft keyboard, expression `√3/2`, >slider valid values, invalid input retention, scroll + zoom behavior;
- large-font portrait layouts and iPad/Android safe areas.

Provide a simple optional quality preference (`auto`/`reduced`) **only if measurements justify it**, never silently altering the engine's numerical accuracy; reduce path rendering detail and visual overlays, not solver outputs. Keep 3D lazy loading and separate JS chunks.

---

## 6. Engineering implementation sequence

Recommended deliverable tasks and integration gates:

**Phase 0 — Preflight:** Validate actual 16-model coverage, baseline commands, current exam flags and route/store boundaries. Commit / record baseline for comparison.

**Phase 1A — Typed exam case catalog:** Schema, provenance/rights guards, six original verified fixtures, independent expected answers and model mappings. Add tests before UI.

**Phase 1B — Hosting audit & diagnostics foundations:** Prepare one hosting workflow, staging base-path test and `device-check` state/test harness. No need for provider credentials to complete static configuration.

**Phase 2A — Problem-to-simulation runtime:** Real case routes, step sequence, original prompt with answer mask, validated scene setup, “return to case” and “restore personal scene” behavior, teacher controls, practice/learning path links.

**Phase 2B — PWA, offline & genuine touch fixes:** Static HTTPS if authorized; robust offline lazy case assets, update notices, diagnostic export and bounded usability fixes with regression tests.

**Phase 3 — Combined integration:** Home and learning path navigation, content statistics, back/forward/deep-link, offline, prior storage migration, 16-model router/lesson practice integration. Shared files only edited/integrated by one main agent.

**Phase 4 — Full independent QA:** Targeted physics case tests + full existing typecheck/Vitest/Playwright/PWA/build; capture screenshots and real limitations. Update source audit and QA docs.

Do not confuse parallel work with skipping integration: the round is incomplete if Track A is finished but Track B deploy config or diagnostic UX is missing, or vice versa.

---

## 7. Automated acceptance matrix (new tests required)

### Track A — Source and content

1. Six original cases satisfy schema, unique IDs, original-rights flags and independently checked results; each maps only to real model and parameter keys.
2. Unverified third-party paper metadata cannot display copied original text or an “official answer” badge. Neither `verifiedOnline` nor `rights` is inferred from a URL.
3. A case launch injects correct SI values, including `√`, fractions, angles and scientific notation, without slider clamping, and the target state matches independently calculated observables.
4. At least 2 multi-stage flows expose honest coverage limits; one stage's final conditions are only propagated when mathematically compatible and explicitly mapped.
5. Answer masking, checkpoint navigation, variation and answer display work; returning to the question restores stage and scroll/focus sensibly.
6. Leaving a case does **not** overwrite a saved model scene, delete particle roster, reset unrelated launchTimes or erase manual induction history.
7. Import with malicious/invalid case type or numeric payload does not execute code, loop forever or change valid state.
8. New original cases work offline after the first valid install; external paper links remain clearly online-only.

### Track B — PWA and tablet

1. Clean build and HTTPS-aware static deploy config; verify root and case/model deep links on both `npm run preview` and chosen base-path test.
2. Install/update/offline tested in clean and returning browser profiles; previous 132-question answers, scenes and progress are preserved.
3. Device checklist starts `NOT_TESTED`, never asserts physical tablet pass from a CDP viewport; export sanitization test ensures no private model/user data included.
4. WebGL unavailable/context lost falls back or recovers as designed, with no infinite render loop; no blank permanent stage.
5. 1194×834, 1024×768, 768×1024, and at least one Android tablet-like portrait viewport: no horizontal page overflow or hidden critical controls.
6. Mathematical expression keyboard interactions and case deep links do not violate independent-particle editing or continuous manual time semantics.
7. All sixteen models, 132 baseline practice questions, case study routes, learning paths and local progress are available after a valid offline pre-cache.

### Full regression

Run the repo's current equivalents of:

```sh
npm run typecheck
npx vitest run
npx playwright test
npm run build
npm run test:pwa
```

The reported last-round baseline is **521 / 159 / 2**. Verify actual counts; never assert those counts as the result of this new round without running them. Keep old assertions; when an actual test becomes obsolete, document the reason, preserve the protected behavior in updated assertions, and explicitly report the change.

Report observed p50/p95 render intervals under a controlled Chromium environment separately from **measured physical-device** results. Headless unthrottled `requestAnimationFrame` is not a 60 FPS / heat / battery claim.

---

## 8. Content QA and physics proof policy

**Separate two layers of correctness:** (a) the physical simulator's engine, (b) the question's interpretation and pedagogical solution. A bug or wrong premise in a case should not be hidden by making the engine expected value equal its current output.

For every case supply:

- a Markdown derivation (math, assumptions, units, sign orientation, conservation or force law);
- an independent exact/hand-computed value or cross-checked numerical calculation for 2+ observables;
- an automated test comparing that independent value to the real model after state injection;
- a review of where the model stops being exact (e.g. ideal edges, neglected self-induction or relativity, two-dimensional approximation);
- at least one wrong-answer explanation or typical student misconception;
- a summary of how changing one input changes the result and which parameters cannot be compared as independent.

For P08 inverse cases, retain `uncertain / not-found-within-search` states; do not claim exhaustive mathematical nonexistence from a finite scan. For P07 source-only references, do not claim the teaching preset reproduces the precise actual exam geometry if that geometry is unverified or not supported. For I07 impact, keep Joule and impact losses separate.

---

## 9. Documentation to create/update

New or updated documentation (adapt paths as needed):

- `docs/ROUND15_BASELINE_AUDIT.md` — actual baseline and architecture decisions.
- `docs/EXAM_SOURCE_AUDIT.md` — year/region/paper/question/source URL, publisher, direct verification evidence, permissions, notes, unresolved items.
- `docs/PROBLEM_CASE_SCHEMA.md` — typed case model, provenance/rights, scene seeds, mapping and authoring examples.
- `docs/CASE_MODEL_MAPPING.md` — six originals + verified metadata-only references, stage-by-stage coverage and unsupported physics.
- `docs/CLASSROOM_DEVICE_QA.md` — actual device checklist template and explicitly NOT_TESTED status.
- `docs/DEPLOYMENT_STAGING.md` — chosen host, build/deploy/rollback, HTTPS, PWA install/offline/update steps and access blockers.
- `docs/ROUND15_QA.md` or `docs/QA.md` section — exact commands/test counts, known failures/retries, screenshots, p95, source audit results, verified staging URL only if real, hardware limitations.
- Update `README.md`, `REQUIREMENTS.md`, `CONTENT_MAP.md`, `DECISIONS.md`, `MODEL_COMPLETION_MATRIX.md`, `AGENT_HANDOFF.md` as appropriate, clearly separating **16/16 model implementation** from **exam publication rights**, **public release**, and **real-device QA**.

Create screenshots of real rendered case list, a case prompt, its injected simulator, solved/unsolved view, source-only unverified card, offline case, diagnosis page, and iPad-width portrait/landscape. Screenshots from browser automation must be labeled simulated.

---

## 10. Decision policy and deliverable report format

For ambiguous choices, follow this preference order:

1. Physical truth and legal/provenance correctness.
2. Preservation of working 16-model simulation system and 132 original practice questions.
3. Student tablet usability and teacher classroom workflow.
4. Traceable tests and efficient reused code.
5. Cosmetic polish or package size reductions.

Avoid adding a second runtime, duplicating lesson/practice logic, or reworking unrelated infrastructure. Respect existing codebase conventions. Add no gratuitous backend or user accounts.

**Final Codex report must contain both independent workstreams:**

- **Track A:** source audit status with explicit verified/unverified counts, six case IDs and why each is original, per-stage solver mapping, independent numeric anchor tests, genuine screenshots, links from case to model and back, and open copyright/source questions.
- **Track B:** exact hosting configuration and (if genuinely successful) live HTTPS URL, install/offline/deep-link test evidence, device check function and exported redacted report, real device statuses or NOT_TESTED, UI fixes, test screenshots, measured limits.
- **Overall:** changed files, physical regression results, actual Vitest/Playwright/PWA/typecheck/build outputs, case count vs question count, 16-model preservation, known bugs and explicit remaining work.

**No success claims without concrete observed evidence. Do not stop after a plan or mock screen; implement both workstreams in the existing repo.**

---

## 11. Ready-to-run Codex kickoff (also supplied separately in chat)

Read this exact task brief and current repository. Implement Round 15 Track A (source-aware, original high-school-exam-style cases preloading real simulation states with guided derivation) and Track B (HTTPS deployment-ready tablet delivery and honest real-device diagnostic workflow). Start by auditing the current 16-model system, 132-question baseline and exam-source flags. Prioritize typed fixtures + independent physics proofs and source/rights safety; preserve every previous model, live-edit behavior and all existing tests. Finish with full regression, actual evidence and clear remaining limits. Do not claim real tablets, copyright permissions or public deployment without verification.
