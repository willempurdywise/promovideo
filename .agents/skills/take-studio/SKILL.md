---
name: take-studio
description: Open a working prototype from its Codex project chat in Take Studio, with an interactive browser preview, copyable video briefs, native appearance, frame-by-frame 60 fps rendering and timestamped review comments. Use when asked to film or review a working prototype with Take Studio.
---

# Take Studio

For another project or a portable installation, follow [other prototypes](references/other-prototypes.md). Do not reuse this chat's prototype URL, output folder, saved background or selectors.

Use the current chat's project or the prototype path the user supplied. Inspect the project's startup instructions and start its normal local dev command, or reuse an existing verified preview for that project. Use a reachable `http://127.0.0.1:<port>/` address with the applicable entry route. Keep the dev server running while the user explores or reviews. Preserve the project's source and use its existing dependencies and package manager.

Start the bundled editor in the skill's `app` folder. If working from the development copy, use the sibling `video-canvas` folder instead. Install app dependencies with `npm ci` if missing and install the matching Chromium with `npx playwright install chromium` if needed. The editor uses FFmpeg from `FFMPEG_PATH` or PATH. Set a free editor port and an absolute output directory in the current workspace.

```sh
PORT=4173 TAKE_PROTOTYPE_URL=http://127.0.0.1:3000/ TAKE_OUTPUT_DIR="/absolute/prototype/path/.take-studio/renders" npm run dev
```

Use the project's verified address instead of the example port. Verify the editor serves that address from `/api/live-prototype`. Open the editor in a Codex browser or preview panel if the session provides one. Otherwise open or link the local address in the browser. The editor uses a dark canvas with the live prototype screen centred, its native status bar retained, and an always-visible circular settings button at the bottom right. The button opens a compact dark floating panel with Settings/Review tabs, segmented format and cursor controls, a timing slider, colour swatches, hex input, background upload, storyboard and green Copy video settings button; opening or closing the panel must preserve the prototype viewport and navigation state. A skill does not register a native Codex sidebar.

The timing slider maps Slow to 0.75× with longer pauses, the midpoint to 1× with readable pauses, and Fast to 1.25× with shorter pauses. Additional prototype and reading-pause controls are available from the options button. Keep imported brief values until the user changes them.

The user explores the prototype, then opens the floating panel to choose a background, viewport, format, playback speed, reading pauses, cursor and free-form storyboard. **Copy video settings** saves the settings and uploaded background locally and copies a brief to paste into the project chat. The panel does not interpret or execute natural-language storyboards. Do not require exact control names or command syntax from the user.

## Preserve appearance and native motion

Use the bundled `app/server.mjs` and `app/capture-offline.mjs` for future captures. The default is native timeline rendering at 60 samples per output second, not a real-time screenshot loop or a 30 fps recording re-encoded at 60 fps.

Before copying or rendering a brief, follow [prototype appearance](references/prototype-appearance.md). Preserve the selected light/dark theme, native status bar, device framing and dataset. The bundled development bridge is needed when the preview and editor have different origins. Do not assume a fresh browser inherits the user's theme or prototype settings. An old brief with no appearance, or `appearance.verified: false`, needs live inspection or a focused clarification; do not silently render it in light mode. Never draw a replacement status bar or squeeze a native phone into the app-only viewport.

For installation or capture-engine changes, run `node tests/offline-capture.mjs` from the skill's `app` directory after dependencies and Chromium are installed. It checks 30 distinct frames in a native 500 ms transition, exact sample spacing, the endpoint and the native completion event. This is a regression test, not a substitute for inspecting the requested journey.

## Create or revise a video from a copied brief

Read the referenced `brief.json`. Preserve its settings and read any timestamped review comments alongside the previous video. Check `/api/live-prototype` at the brief's editor URL and reuse the running editor. Do not start a separate editor when it is reachable. Background uploads are saved as local files beside the brief, not temporary browser URLs.

Inspect and rehearse the live prototype using browser tools or Playwright. Resolve descriptions such as “recipient currency pill” from the actual UI, tolerating ordinary typos. Check each resulting screen. Do not edit product code or invent missing screens to satisfy the storyboard; explain an unavailable step or ask a targeted question when intent is ambiguous.

Translate the rehearsed journey into explicit commands for capture. POST JSON to `<editorURL>/api/render` with `Origin: <editorURL>` and `Content-Type: application/json`, with body `{"briefId":"<id>","storyboard":"<commands separated by newlines>"}`. The server loads saved settings, background and current prototype registration. Use a structured HTTP client or a JSON file, not shell-interpolated prose. The original natural-language storyboard stays in the brief.

Supported commands: `selector <inspected CSS selector>` clicks a unique visible target; `click <visible name>` uses case-insensitive exact text; `type <value>` types into the focused input; `enter <value> in <field>` uses a label/placeholder; `hold <seconds>` pauses; `scroll <pixels>` scrolls the page. The recorder also supports ordinal recipient selection and amount entry. Prefer inspected selectors for descriptive or ambiguous controls. These commands are internal capture instructions, not the user-facing prompt language. Do not claim a journey is supported if it cannot be represented faithfully.

Capture starts fresh at the prototype entry URL, supports up to 25 steps and a 90-second capture limit. Playback speed adjusts the exported video; native app timings are unchanged. Reading pauses and explicit holds are measured in final-video seconds. Formats are 1920×1080, 1080×1080 or 1080×1920; the app-only mobile viewport is 390×844 and desktop is 1440×844. When the brief includes `appearance.nativePhone`, capture the prototype’s actual phone wrapper, status bar and intrinsic screen dimensions instead. Restore its saved colour scheme, device and dataset query. A development-only preview bridge supplies these settings; a brief marked `appearance.verified: false` uses a system-theme fallback and requires inspection. Cursor visibility comes from the brief.

Poll `/api/render/<job-id>` until ready or failed. The editor automatically opens the resulting MP4 for the pending brief, including after reload. Inspect representative frames and actual interactions before claiming the video is verified; the renderer performs a full decode. Deliver the video link and editor URL. For revisions, the user adds timestamped comments, changes their storyboard/settings and copies a new brief; preserve unaffected choices. If the editor restarted, live prototype IDs are resolved from the saved URL. Folder-upload prototypes must be reopened if their preview server is gone.

The capture browser permits requests to the configured prototype origin. Inspect the running app for external image/font/media hosts and pass their verified origins as a comma-separated TAKE_ASSET_ORIGINS value when starting the editor. Include observed redirect origins. These origins allow GET requests for images, fonts, media and stylesheets only, not scripts, navigation or API calls. The recorder waits for visible images and fonts and reports missing assets instead of silently exporting broken images. A prototype requiring another origin, an existing authenticated browser session, or routes that prohibit framing may need an authorized local preview mode. Report the specific limitation when it occurs. Review uses an MP4, bottom scrubber and timestamped comments. Comments stay in the current browser and can guide a subsequent edit.

Capture renders the native prototype offline at 60 samples per output second. Playwright's clock drives JavaScript timers and requestAnimationFrame; the browser's existing CSS/Web Animation effects are sampled at the same times, keeping their original easing, durations and completion events. Each output frame is captured losslessly before H.264 encoding. This takes longer than real-time recording but avoids duplicating dropped frames or interpolating screenshots. Do not replace app animations or change their CSS durations. The native phone is captured directly, with its original device wrapper and status bar.

Check `<video-id>.capture.json` for `mode: offline-native-timelines`, rendered frame count and per-frame hashes. Verify distinct frames during transitions as well as full decode and visual inspection; static reading holds naturally repeat. Video elements, animated raster images and animations driven by external clocks need separate validation and must not be described as guaranteed frame-accurate by this mode. Native CSS/WAAPI and clock-driven JavaScript are the supported animation sources.

To open a specific revision directly, use `<editorURL>/?video=<video-id>&brief=<brief-id>`.
