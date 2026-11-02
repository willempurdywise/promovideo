# Motion source

The source is https://github.com/transferwise/base-surfaces, the mobile component styles. The extractor supports both the older `src/styles.css` and the current `src/components/PageTransition.css`, `BottomSheet.css`, and `PrototypeSettings.css`. The bundled `assets/motion.json` records the Git commit and SHA-256 hashes of the exact CSS working files used, including any local edits.

`scripts/sync_motion.py <checkout> --output <project>/motion.json` extracts page duration, Bezier, outgoing parallax/opacity, incoming opacity/radius and opacity duration, plus full-screen sheet Bezier and duration, and optional BottomSheet spring points, delay, extra travel, radius, dim amount and dim duration. It fails if expected selectors change instead of silently substituting old values. Point a storyboard's `motion_profile` at that output, or pass `--base-surfaces` for direct extraction during every render. Repository access is required to obtain a fresh checkout; never imply the pinned snapshot is current upstream.

Mapped selectors: `.page-layer--old--push.page-layer--animate`, `.page-layer--new--push`, `.page-layer--new--push.page-layer--animate`, `.fs-sheet`, `.wise-bottom-sheet`, `.wise-bottom-sheet__backdrop`, `.wise-bottom-sheet__backdrop--visible`.

Page push/pop uses the source timing, translation and opacity. Payment/full-screen modals default to `.fs-sheet`: 500 ms cubic-bezier(.32,.72,0,1), with no overshoot. Only `preset:"spring_sheet"` uses the generic inset BottomSheet CSS linear() spring. Both retain separate backdrop easing. Screenshot sheet geometry stays faithful to the supplied frame: it does not force the source component's inset layout onto a different design. The renderer does not reproduce CSS box shadows or interactive drag physics. Full-page rise/fade and video intro/outro remain editorial transitions; inspect the actual component if exact app parity is required. Other flows have different CSS (including 380 ms send-flow panels); inspect those before choosing an override or adapting the renderer.

## Included repository

`vendor/base-surfaces` is a Git submodule linked to https://github.com/transferwise/base-surfaces. Clone this skill repository with `--recurse-submodules`, or run `git submodule update --init --recursive` after pulling. It is pinned to a reviewed commit, not auto-following upstream. Access to the private dependency is required.

Resolution order: explicit `base_surfaces` path, explicit `motion_profile`, initialized bundled submodule, bundled snapshot. An inaccessible explicit path fails instead of falling back. Missing/uninitialized submodule uses the snapshot and is reported in the console and per-video `.motion.json` file. Standalone skill installers may not fetch submodules; use a recursive clone or provide a local checkout in that case.
