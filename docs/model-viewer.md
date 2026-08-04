# Model Viewer — a widget for the user's own 3D models

The Model Viewer displays user-provided 3D models — react-three-fiber
components checked into the repo — with orbit controls. It is the fourth
WebGL widget, but the first that is a *viewer* rather than a game: no HUD,
no telemetry loop, just a model catalog, a camera you drag, and two toggles.
The first catalog entry is the **LEGO SWAT Truck**, a primitives-only build
(no asset files) with animated wheels, a blinking red/blue siren lightbar and
canvas-drawn "S.W.A.T." lettering on both sides.

## Stack

- three.js + @react-three/fiber, loaded through the standard eager-shell /
  lazy-body split (`ModelViewerWidget.tsx` → `lazy(() =>
  import('./ModelViewerBody'))`), so the widget rides the same shared
  three/fiber chunk as the game widgets and nothing heavy touches the main
  bundle.
- **Orbit controls come from `three/addons/controls/OrbitControls.js`** —
  three's own addon, not `@react-three/drei` (which is not a dependency of
  this repo and would be a large one to add for a single control).
  `three@0.185` and `@types/three@0.185` both export the `three/addons/*`
  alias, so it typechecks under `moduleResolution: "bundler"` and Vite
  splits it into the lazy chunk like everything else.

## UI & controls

- **Orbit gestures** on the canvas: drag to orbit, wheel/pinch to zoom,
  right-drag/two-finger to pan. Damped; the target sits at the model's
  mid-height (y = 0.6). The whole root is `widget-no-drag` so none of this
  fights react-grid-layout.
- **Model picker** — one toggle button per catalog entry.
- **Animate** (default on) — the model's own motion; for the truck, the
  wheels spin and the siren lightbar strobes (red/blue alternate every
  0.4 s, the amber cap double-times; off = steady dim glow). What "animate"
  means belongs to each model.
- **Auto-rotate** (default off) — the *camera* orbits the model
  (`controls.autoRotate`); independent of Animate.

All three settings persist per widget instance via `useWidgetField` /
`updateWidgetData`.

## Architecture

```
ModelViewerWidget.tsx      eager shell, registered in widgetRegistry
└─ ModelViewerBody.tsx     lazy chunk entry: persisted fields, picker,
   │                       toggles, root data-* contract
   └─ ModelViewerStage.tsx Canvas + lights + OrbitControlsRig + FrameProbe
      └─ <Model animate/>  the selected catalog component
```

- `modelCatalog.ts` — `MODEL_IDS` / `ModelId` / `MODEL_CATALOG`
  (`{ id, name, Component }`) / `modelById` / `coerceModelId`. Imported
  only by the lazy body, so every model lives in the 3D chunk.
- `OrbitControlsRig.tsx` — constructs/disposes the addon controls against
  the R3F camera + canvas in a `useEffect`; `autoRotate` is forwarded
  through a ref read in `useFrame` (the canvas root's prop schedule lags —
  lesson #48 — and damping needs a per-frame `update()` anyway).
- `FrameProbe` (in the stage) — mirrors the render loop onto the DOM as a
  throttled `data-frames` counter via `probeRef.setAttribute`, the only
  observable proof that frames are being produced (lesson #29/#46 pattern).
- The stage's canvas is transparent, so the card background shows through
  and both themes work with zero theme plumbing.

### Adding a model

1. Drop the component in `models/` — a venue-neutral group of meshes:
   **no Canvas, no lights** (the stage owns those), facing +Z, resting on
   y = 0, roughly 1.5–2.5 units tall so the default camera frames it.
   Accept `{ animate: boolean }` and gate any motion loop on it (mutate
   refs in `useFrame`, never React state).
2. Register it in `modelCatalog.ts`: add the id to `MODEL_IDS` and an entry
   to `MODEL_CATALOG`. The picker button, persistence coercion and
   `data-model` contract follow automatically.

### The SWAT truck adaptation

The truck arrived as a standalone app (own `<Canvas>`, lights, drei
OrbitControls). Adapting it: the Canvas/lights moved to the stage, the
wheel-spin `useFrame` gained the `animate` gate, and one real bug was
fixed — the head/tail lights set `rotation={[Math.PI/2,0,0]}` on
`<cylinderGeometry>`, which R3F silently ignores (transforms are Object3D
props); the rotation moved to the parent `<mesh>` so the lights face out
from the truck's faces (lesson #76).

Round 2 additions:

- **Siren strobe** — the three lightbar materials carry refs and their own
  colour as `emissive`; the wheel `useFrame` also flips `emissiveIntensity`
  from `clock.elapsedTime` (the `GateRings` pulse pattern). Gated on
  `animate`; parked trucks keep a steady 0.15 glow.
- **S.W.A.T. decals** — "S.W.A.T." drawn once on an offscreen 512×128
  canvas → `CanvasTexture` on an unlit transparent `planeGeometry` a hair
  off each side of the rear body (no font assets, no drei — lesson #78).
  The texture is a lazy module singleton shared by every truck instance,
  because the model is multi-instanced: **the Drone Strike renders its
  moving car targets with this same component** (`droneStrike/
  CarTargets.tsx`), so changes here must stay pool-friendly — no
  per-instance texture creation, no assumptions about being the only truck
  in the scene.

## Test contract (data-*)

On the root (`data-testid="model-viewer"`):

| attribute | values | owner |
|---|---|---|
| `data-model` | `ModelId` (`legoSwatTruck`, …) | React |
| `data-animate` | `on` / `off` | React |
| `data-autorotate` | `on` / `off` | React |
| `data-frames` | integer counter, written every 10 frames | render tick |

Controls: `model-viewer-picker`, `model-viewer-animate`,
`model-viewer-autorotate`.

## E2E test suites

| Suite | Covers |
|---|---|
| `140-model-viewer` | lazy chunk + WebGL canvas, truck default, `data-frames` advances, Animate/Auto-rotate round-trips, picker mirrors `data-model`, reload persistence |

## Future work (enhancement backlog)

Everything above is shipped. Ideas for future rounds, with the integration
point each builds on:

- **More models** — the whole point of the catalog: each new pasted model
  is one file + one `MODEL_CATALOG` entry, and suite 140's picker-switch
  assertion activates with model #2.
- **Per-model lazy chunks** — if a heavy model lands (many meshes, baked
  data), swap its catalog entry to `lazy(() => import(...))` + Suspense
  inside the stage; the catalog shape already isolates the change.
- **Camera presets** — front/side/top buttons that tween
  `controls.target`/camera position; builds on `OrbitControlsRig`'s ref.
- **Turntable base** — an optional figurine disc + slow model spin,
  reusing the look of `FigureStage3D` without its no-controls limitation.
- **Wireframe / exploded view** — a display-mode toggle passed down as a
  prop next to `animate`.
- **GLTF/GLB loading** — a real file-import path (three's GLTFLoader) for
  models exported from other tools; a deliberate scope-up from the
  code-model catalog (per the user, not needed today).
