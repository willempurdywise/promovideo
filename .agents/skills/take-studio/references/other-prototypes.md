# Use Take Studio in another project

Invoke `$take-studio` from that prototype's project chat. Start or reuse that project's own development server; verify both rendered content and its listener's working directory. Do not reuse the last project's port or output folder by default.

## Runtime setup

The skill bundles its own editor and renderer. From the installed skill's `app` directory, run `npm ci` when dependencies are missing, then `npx playwright install chromium`. Node.js and FFmpeg must be available; set `FFMPEG_PATH` to a working FFmpeg executable if it is not on PATH. Keep dependency installation inside the skill rather than adding packages to the prototype.

Launch with the new project's actual values:

```sh
PORT=4173 TAKE_PROTOTYPE_URL=http://127.0.0.1:3000/ TAKE_OUTPUT_DIR="/absolute/new-project/.take-studio/renders" npm run dev
```

Use a free editor port. Confirm `/api/live-prototype` matches the new project before opening the editor. Use a separate editor process/output directory for each concurrently open project. Keep the prototype running during review. Uploaded backgrounds and briefs belong in that project's output directory, not in the installed skill.

## Appearance integration

A normal mobile or desktop web page can use the generic iframe capture path. Inspect its selected theme, entry route and any dataset or state needed to reproduce the view. If it follows the system colour scheme, restore that through the brief; if it uses custom persisted settings, adapt its development bridge and capture setup before claiming they are preserved. An unverified fallback theme is not the user's confirmed theme.

The included `assets/base-surfaces-preview-bridge.ts` and native-phone selectors in `app/server.mjs` are specifically for Base Surfaces. Use them only when that actual DOM structure exists. For a different native phone wrapper, inspect its real screen, status bar and bezel, then adapt the appearance reader and renderer to that structure. Do not mark an unrelated shell as `nativePhone: true` while retaining the Base Surfaces adapter, fabricate a status bar, or silently crop it out. Explain any unsupported wrapper before rendering.

External image/font origins must be observed in the new prototype and supplied through `TAKE_ASSET_ORIGINS`; old projects' allowlists are not portable. Rehearse that project's controls before translating a storyboard into capture commands. Never copy account selectors or a previous video's navigation into a different prototype without inspection.

## Portable installation

The `take-studio.zip` package contains a top-level `take-studio/` folder. Extract that folder into the target Codex skills directory (normally `~/.codex/skills/`), retaining any existing installation until its replacement is verified. Run the runtime setup above. In a new project chat, invoke:

```text
Use $take-studio to open this prototype so I can configure and create a video.
```

The archive intentionally excludes dependencies, browser binaries, rendered videos, saved briefs, uploaded backgrounds and project-specific rehearsal scripts. The installed skill supplies the same floating settings, copy-to-agent brief workflow, review UI and offline 60 fps renderer across projects; native wrapper integration remains prototype-specific.
