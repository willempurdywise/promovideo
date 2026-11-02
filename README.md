# Wise Product Video

A reusable Codex skill for creating Wise-style product demo videos from a running prototype or uploaded screenshots and a written storyboard. Includes a configurable Python renderer, Wise logo, spinning loader, and success animation.

## Test with your own screens

1. Clone this private repository with its linked base-surfaces dependency, then open it as a Codex project:

   ```sh
   git clone --recurse-submodules https://github.com/willempurdywise/wise-product-video.git
   ```

   For an existing clone, run `git submodule update --init --recursive`. You need access to both private repositories.
2. Add your screens to `projects/my-demo/screens/` (the `projects/` directory is ignored by Git).
3. Ask Codex:

   > Use $wise-product-video to create a video with these screens

Codex first asks you to upload your storyboard (or describe the actions in chat), with a plain-language example as a hint. After receiving it, Codex shows selectable questions for format, background type and logo visibility. Choosing a solid background opens a selectable list of all ten colours. It also asks about target duration or automatic pacing. Native question-tool support is required for clickable choices; on hosts without it, Codex explains the limitation and asks for typed answers. It reuses anything you have already supplied.

The skill lives at `.agents/skills/wise-product-video/` so it is available within this repository. To use it in another project, copy that whole folder into the project's `.agents/skills/`, or ask Codex's skill installer to install it from this repository. Team members need access to this private repository first. If the skill does not appear, restart Codex.

Provide screenshots plus the interaction order. Optional inputs include camera footage, transparent keyboard assets, GIFs, and desired timing. Full square frames or clean phone-screen exports both work; Codex should inspect and configure the crop. New projects do not depend on the original author's files or chat history.

## Run the example without Codex

Python 3.11 or 3.12 is recommended. From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r .agents/skills/wise-product-video/scripts/requirements.txt
.venv/bin/python examples/make_example.py
.venv/bin/python .agents/skills/wise-product-video/scripts/render.py examples/generated/storyboard.json --output output/example.mp4
```

On Windows, use `.venv\Scripts\python.exe` in place of `.venv/bin/python`.

The generated example uses deliberately simple placeholder screens to demonstrate page slides, a bottom sheet, tap feedback and the branded loop. It is a renderer smoke test, not a finished product design. The renderer exports a contact sheet and performs a full FFmpeg decode check after encoding. Inspect the contact sheet and transitions before accepting a video.

## Defaults and limits

- Choice of 1:1 (1080×1080), 16:9 (1920×1080), or 9:16 (1080×1920), at 60 fps.
- Ten paired Wise colours or an uploaded photo background; centred phone with subtle 24 px entrance/exit.
- Optional Wise logo; automatically uses the partner colour for solid backgrounds.
- 190 ms tap feedback; page and sheet motion extracted from base-surfaces (live checkout or bundled source snapshot).
- Configurable screenshots, holds, crops, PNG/GIF/video overlays and chroma key.
- Typing, animated keypads and zooms require a project-local renderer adaptation; the skill explains how to preserve the established style.

See [SKILL.md](.agents/skills/wise-product-video/SKILL.md) for the workflow and [storyboard format](.agents/skills/wise-product-video/references/storyboard.md) for the JSON schema. All paths are relative to each storyboard; bundled assets use an `@` prefix. Dependencies include a bundled FFmpeg executable through imageio-ffmpeg.

Brand assets are provided for the team's Wise work. This repository does not grant a public license to Wise branding. Keep project inputs and rendered videos out of commits unless intentionally sharing them.

## Choose video options

Codex will ask for format, background and logo visibility before a new video. Example:

> Use $wise-product-video with these screens. Make it 9:16, with a Bright Blue background and the Wise logo on. Read page animations from my local base-surfaces checkout.

Colour pairs (either direction): Bright Green #9FE870 / Forest Green #163300; Bright Blue #A0E1E1 / Dark Charcoal #21231D; Bright Yellow #FFEB69 / Dark Gold #3A341C; Bright Orange #FFC091 / Dark Purple #260A2F; Bright Pink #FFD7EF / Dark Maroon #320707. Photos are cover-cropped; logo colour is configurable for readability.

```sh
.venv/bin/python .agents/skills/wise-product-video/scripts/render.py examples/generated/storyboard.json --output output/wide.mp4 --format 16:9 --background "Bright Blue" --logo on --base-surfaces /path/to/base-surfaces
```

Omit `--base-surfaces` to read the included base-surfaces submodule automatically. If it is not initialized, the renderer reports that it is using the bundled snapshot instead. Every render records the source commit and CSS hashes in a `.motion.json` file beside the video. The submodule is pinned; it does not automatically update from GitHub. See [motion sourcing](.agents/skills/wise-product-video/references/motion.md) for mappings and screenshot-rendering limits.

## Modal motion and scrolling

Payment/full-screen modals use base-surfaces' smooth 500 ms curve with no bounce. The generic inset BottomSheet spring is an explicit opt-in (`preset: "spring_sheet"`), not the default.

Scrolling uses smaller eased movements separated by pauses. Supply a tall content export; Codex configures the scroll viewport so headers and bottom controls remain fixed. The storyboard records swipe distances, durations and pauses for later refinement.

If installing just the skill folder through a skill installer, check whether `vendor/base-surfaces` was populated. Some installers omit submodules. A recursive clone is the recommended setup; an explicit local `--base-surfaces` path remains supported.

Uploaded screens are cropped into one shared phone frame with a fixed **40 px outer corner radius**. The mask also clips transitions and media overlays; source uploads and full-canvas backgrounds remain unchanged.

## Use with an existing prototype

Install/copy the complete skill folder into the prototype's `.agents/skills/`, then ask:

> Use $wise-product-video to show this prototype: tap Send, choose Clara Smith, enter 500 GBP, continue to review, then complete the demo payment.

The skill reads the repo, starts or reuses the local app, asks for format/background/logo/timing choices, then captures the real journey. It uses the prototype's actual screens, content and animation rather than recreating them. It saves an editable journey and applies the selected video framing around the recording. Static screenshot mode remains available when used independently.

See [prototype capture](.agents/skills/wise-product-video/references/prototype.md) for setup, supported actions, and capture limits. Browser capture is typically 25 fps even when the final MP4 is encoded at 60 fps.
