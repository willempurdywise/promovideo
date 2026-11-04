# Capture an existing prototype

## Intake and preparation

1. Read the active repository's instructions, package scripts and relevant flow components. Determine the actual app root, startup command and mobile entry route. Do not guess ports or overwrite the app to fit the video.
2. Collect the user's journey first, for example: “Open Send, choose Clara Smith, enter 500 GBP, continue, review, then show success.” Inspect which states are implemented. Afterwards use the skill's selectable format/background/logo/timing questions, skipping already answered choices. Do not ask the user for selectors or JSON.
3. Start or reuse the local preview. Verify the exact URL responds and inspect the rendered app. Find controls by accessible names or existing test IDs; use inspected CSS selectors only when needed. Use fresh test state and prototype data. The capture helper accepts loopback URLs so an example journey does not accidentally act on a production financial service.
4. Confirm viewport and device framing. Default to a clean 390×844 mobile viewport. If the prototype already displays a surrounding device frame, use its supported mobile route/configuration or adapt the capture crop; do not squeeze two device frames together or strip the app's real status bar blindly. Desktop demos use `device: "desktop"` and a matching viewport; read [desktop presentation](desktop.md) for automatic fitting, visible cursor and slower pacing.

## Run real interactions

Use a browser tool to inspect/rehearse first, then create a project-local journey JSON from observed controls. Preserve all native animation, loading, content and input behaviour. Use condition-based waits for page readiness and deliberate reading holds. Do not globally change CSS durations, replace native keyboard UI, invent recipient data, or alter product code merely to make the recording easier. If a route needs unavailable permissions, hardware or backend state, explain the specific gap; use an existing fixture/demo mode when available.

The optional helper drives Playwright and records the actual viewport:

```sh
npm ci --prefix <skill>/scripts
node <skill>/scripts/node_modules/playwright/cli.js install chromium
export WISE_FFMPEG="$(python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
node <skill>/scripts/capture-prototype.mjs <project>/journey.json <project>/capture
python <skill>/scripts/render.py <project>/capture/storyboard.json --output <project>/output/demo.mp4
```

The Node dependency is separate from the Python screenshot renderer. Use an isolated writable npm/browser cache if the environment requires it. Do not install dependencies into or modify the prototype's package manifest for this helper.

```json
{
  "url":"http://127.0.0.1:3000/",
  "viewport":{"width":390,"height":844},
  "ready":{"role":"button","name":"Send"},
  "presentation":{"format":"1:1","background":"Bright Green","logo":true},
  "steps":[
    {"action":"pause","ms":1000},
    {"action":"click","role":"button","name":"Send"},
    {"action":"waitFor","role":"button","name":"Clara Smith"},
    {"action":"click","role":"button","name":"Clara Smith"},
    {"action":"type","role":"textbox","name":"Amount","value":"500"},
    {"action":"pause","ms":700},
    {"action":"click","role":"button","name":"Continue"}
  ],
  "finalHold":1500
}
```

This is illustrative: verify names in the actual prototype. Each target uses `role` with exact `name`, `testId`, or `selector`. Supported actions: click, fill, type (90 ms per character by default), press (`key`), waitFor (visible), pause (`ms`), scroll. Scroll targets the real scroll container with `swipes: [{"dy":180,"duration":450,"pause":600}, ...]`, moving in short eased increments. Existing app listeners run normally. Optional `setup` actions occur before recording's chosen start, useful for navigation to the intended initial state. Keep setup non-destructive and scoped to prototype state.

The helper captures every Chromium compositor frame directly through CDP, preserving timestamps, and encodes a 60 fps MP4. It saves raw PNG frames, initial/final PNGs, frame-delivery metrics, an action-timing manifest and a compositor storyboard. The compositor uses one video overlay: no reconstructed page or modal movement. `presentation` holds the already-selected user choices, not new assumed defaults. This bypasses Playwright’s built-in 25 fps recording and its frame throttle. Actual delivery still depends on browser rendering and machine load. `capture.json` and `frames.json` report the observed median cadence during active updates. Static holds naturally need no new frames; a 60 fps file alone is not evidence of 60 distinct frames each second. Inspect motion and metrics; do not claim guaranteed 60 fps capture when the browser delivers less.

Capture begins after setup and page readiness; no estimated startup trim is needed. Inspect opening/closing frames and action alignment. The helper limits a take to 60 seconds; the screenshot compositor decodes video overlays into memory. At 60 fps memory use is higher. For longer/high-resolution recordings, split captures or use a streaming video compositor. Do not silently truncate the journey.

## Verify and deliver

Replay the result. Check action order, correct native screens/content, typing, loading states, tap-to-response timing, short scrolls with pauses, modal overlay coverage and success timing. Inspect intro/outro and loop seam. Check the final MP4 decodes, then deliver it with the editable journey, raw recording, capture manifest and contact sheet. Clearly distinguish a native recording from a screenshot reconstruction.

For base-surfaces specifically, run the user's active base-surfaces checkout and its mobile flow; the bundled submodule is only a screenshot-mode motion reference. Do not substitute it for their working prototype or refresh/reset their checkout.
