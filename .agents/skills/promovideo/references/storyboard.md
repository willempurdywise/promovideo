# Storyboard format

All paths are relative to the JSON file. An `@` prefix selects a bundled skill asset. Coordinates use pixels in the resized phone, not the full canvas. Rectangle `crop`, `patches.box`, and `taps.box` use `[left, top, right, bottom]`; `phone` and `overlays.box` use `[x, y, width, height]`.

See the runnable repository example in `examples/`. A minimal project:

```json
{
  "background": "#9FE870",
  "screens": {
    "home": {"file": "screens/home.jpg", "crop": [345,118,735,962]},
    "review": {"file": "screens/review.jpg", "crop": [345,118,735,962]}
  },
  "scenes": [
    {"screen":"home", "hold":2, "taps":[{"at":1.88,"box":[16,756,374,804]}]},
    {"screen":"review", "transition":{"type":"push"}, "hold":2}
  ]
}
```

## Canvas and screens

- `format`: `"1:1"`, `"16:9"`, or `"9:16"`. Resolves to 1080×1080, 1920×1080 or 1080×1920. Overrides legacy `canvas`. `fps`:60.
- `phone`: defaults to a centred 390×844 rectangle for each format; the outer corner radius is fixed at 40 px in output coordinates. Legacy top-level `radius` values are ignored to keep the phone format consistent. Modal `transition.radius` is separate.
- `background`: palette name (case insensitive) or hex. Optional `background_image` takes precedence, applies EXIF orientation and cover-crops without distortion. `background_position: [0.5,0.5]` controls the focal crop (0–1).
- `logo`: true/false (legacy asset paths and null supported). The alpha silhouette is tinted with the palette partner, in both directions. For photos `logo_color` overrides automatic Bright Green/Forest Green selection; visually check contrast. `logo_size`: `[240,230]` maximum fit.
- `phone_fade_duration`: .45 seconds for both the phone fade-in and fade-out, independent of the position movement and overall intro/outro holds. Must be positive; shortened automatically to fit shorter intros/outros.
- `intro`: .8 seconds (logo then subtle phone entrance); `outro`: 1.5 seconds (phone exit then logo hold). Set to 0 to disable. At least .8 seconds each is recommended for a clean loop.
- `screens`: map of names to `file`, optional `crop`, `flatten_radius` (42), `top_fill`, `bottom_fill`. Each is resized to phone dimensions. For clean rectangular screen exports, set `flatten_radius: 0`. For photographed rounded frames, sample-fill corners to remove the old backdrop; override colors for gradients or unusual chrome.

## Scenes and timing

Total duration = intro + sum of incoming transitions + holds + outro. First scene has no incoming transition. Scene local time begins when its incoming transition starts; all overlay and tap times use this clock. Place a press .12 seconds before the next transition begins: `at = transition.duration + hold - .12`. Holds start after transition completion.

`transition.type`:

- `cut`: instant, zero duration.
- `push`: incoming full page from right, outgoing parallax and opacity from base-surfaces.
- `pop`: reverse navigation using the same source profile.
- `rise`: incoming full page from bottom.
- `fade`: full-page crossfade.
- `modal-in`: incoming screen's sheet rises over dimmed outgoing page.
- `modal-out`: outgoing sheet drops to reveal incoming page.

`duration` defaults to the source profile: page .42; modal .5 with cubic-bezier(.32,.72,0,1) and no bounce. Set `preset:"spring_sheet"` explicitly only for the generic inset BottomSheet (.42 + .04 delay, with overshoot). Modal options: `top:54`, `radius:40`, `dim:0.4`; backdrop uses its separate .3 second ease transition. Explicit duration overrides scale the source motion timing. Set `top` to the actual rounded modal edge, not simply the status-bar height. All baked backdrop above that edge must be excluded. A single full-phone overlay fades over the previous undimmed page, including the status bar, and remains composed throughout the modal hold. For an editorial approximation, use `fade` of .28 seconds to switch currency options within a modal. The current/next image includes its overlays during transitions, keeping success animation synchronized.

`taps`: list of `{ "at": seconds, "box": [l,t,r,b] }` with built-in 190 ms press feedback.

`patches`: list of `{ "box": [l,t,r,b], "fill":"#163300" }`, applied before overlays. Use to erase static icons under moving artwork only when the underlying area is a flat color.

## Media overlays

`overlays`: list, composited in order, each with:

- `file`: PNG, GIF, MP4, MOV or WebM.
- `box`: `[x,y,width,height]` inside phone. Video fills/crops to fit; PNG/GIF resize to these dimensions. Prepare the intended aspect ratio first.
- `start`: scene-local seconds (0); optional `end` removes overlay at that time.
- `loop`: true; false freezes on last frame. `speed`: 1.
- Video only: `fps`:30, `trim_start`:0, `max_duration`:10. Set success to fps60. Decode is memory-resident: crop to the small viewport and bound the duration.
- `blur`: Gaussian radius, useful for camera footage during scanning.
- Optional `chroma_key`: `[r,g,b]`, `key_threshold`:10, `key_softness`:24; removes flat-color backgrounds. Inspect edge quality against the actual target screen.

GIF frame durations and transparency are preserved. Use transparent scanner brackets and loader overlays over blurred camera footage. The generic renderer does not automatically isolate scanner artwork from a screenshot.

For the supplied success clip, sample its background pixel to configure the key rather than guessing. Patch out any static checkmark first; use `start:0` and `loop:false` to start with the page transition.

## Beyond the schema

Typing, moving keypads, zooms, individual controls and complex pre-modal dim phases require a project-local Python adaptation. Preserve supplied assets and established motion curves, then validate the new states and transition midpoints. Do not approximate these with full-screen cuts without telling the user.

## Source profile and command-line choices

`base_surfaces`: path to a local checkout, relative to this storyboard or absolute. Reads supported selectors from the current working files at render time. `motion_profile`: path to an extracted JSON snapshot; ignored when `base_surfaces` is set. With neither override, reads the included `vendor/base-surfaces` submodule when initialized; otherwise reports and uses the bundled snapshot. See [motion sourcing](motion.md).

CLI overrides: `--format 16:9 --background "Bright Pink" --logo on`, or `--background-image photo.jpg --logo off`. CLI paths are resolved from the working directory; JSON paths remain relative to the storyboard. `--base-surfaces /path/to/base-surfaces` selects live extraction.

## Incremental scrolling

Add `scroll` to a scene. `file` is a tall content-only export, scaled proportionally to viewport width. `viewport` is `[x,y,width,height]` within the phone. Chrome outside it stays fixed. Offsets are pixels in the scaled content; positive offsets scroll down. `initial` defaults to 0. Each step moves to an absolute offset with smooth acceleration/deceleration; gaps between steps hold the position exactly. Times are scene-local (including incoming transition). Steps must be ordered, non-overlapping, in bounds, and finish within the scene.

```json
"scroll": {
  "file": "screens/long-content.png",
  "viewport": [0,100,390,620],
  "steps": [
    {"at":1.0,"duration":0.45,"to":180},
    {"at":2.1,"duration":0.55,"to":410},
    {"at":3.4,"duration":0.4,"to":550}
  ]
}
```

Use a scene hold long enough to include these steps and a final reading pause. Patches, media overlays and taps are painted after the scrolling content and remain viewport-fixed. Use them for fixed chrome or feedback, not scrolling content.
