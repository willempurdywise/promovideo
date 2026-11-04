# Desktop presentation and focused zooms

Use these defaults for desktop prototypes and supplied desktop screens. Preserve the supplied desktop layout even when output is portrait. Never reflow it into a mobile layout just to fill the canvas.

## Framing

Set `device: "desktop"` and `viewport: [sourceWidth, sourceHeight]` in renderer storyboards. The renderer contains the screen within the canvas, centres it, leaves at least 8% of the shorter canvas dimension around it, and reserves space for the 24px intro/outro movement. It uses 16px desktop corners; the mobile 40px mask remains unchanged. Crop away existing surrounding backgrounds before fitting. All scene coordinates, overlay boxes, cursor points and zoom targets are in the resulting fitted viewport pixels. Preserve source aspect ratio across screens. Do not stretch, crop away navigation, or add an invented browser toolbar.

For native capture set `device: "desktop"` and a viewport matching the app (e.g. 1440×900). The capture helper generates fitted framing for all three output formats automatically. A viewport at least 768px wide is also treated as desktop. Inspect narrow output at final export size: if important content is too small, explain the tradeoff and suggest a targeted zoom or landscape format; retain the selected format unless the user changes it.

## Mouse and pacing

Always show one visible arrow cursor on desktop. Move it smoothly to the actual target, briefly hover, then click with a subtle pressed state. Keep it visible during pauses. Do not replace it with mobile tap rings or teleport it between unrelated targets. Native capture injects a pointer-events-none cursor overlay and moves the real mouse, so hover and click handlers still run. Do not add a second rendered cursor to this recording. For full document navigation, re-establish the overlay after navigation; inspect that it survives the whole journey.

Native click defaults: 650ms eased travel, 220ms hover, 100ms press, 2200ms reading hold. `moveMs`, `hoverMs`, `holdMs` can override per click. Start with a 2200ms opening hold. Wait for actual readiness as well as holds; a timed pause does not prove loading completed. Use 2–3 seconds on ordinary desktop pages and 3–4 seconds on dense reviews; avoid adding duplicate explicit pauses after automatic holds. Preserve app animation speed. Shorten only when requested; do not force the journey into 20 seconds. Keep incremental scrolling and pauses.

Screenshot mode uses a top-level `cursor` array in content seconds (excluding intro):

```json
"cursor": [
  {"at":0,"x":700,"y":400},
  {"at":2.2,"x":700,"y":400},
  {"at":2.85,"x":450,"y":240},
  {"at":3.07,"x":450,"y":240,"click":true},
  {"at":5.5,"x":450,"y":240}
]
```

Add duplicate position keys for holds and hover. Align screenshot state changes with clicks. Use actual inspected control centres and keep pointer continuity across scene boundaries. A screenshot reconstruction does not have native hover behaviour; use supplied hover states when available, without inventing product effects.

## Requested zooms

Only zoom when requested. Use a continuous pan-and-scale with eased acceleration and deceleration, no bounce or abrupt crop. Defaults: 650ms in, 1.5s focus hold, 650ms out, roughly 1.3–1.8× scale. Keep target and nearby label/context visible; reduce scale if necessary. Zoom the screen and its cursor together, keeping background and frame stationary. Return smoothly to the full view before an unrelated action. Do not change app CSS to create a camera zoom.

The renderer accepts top-level `zooms` (content seconds, fitted viewport coordinates):

```json
"zooms": [{"at":3,"x":450,"y":240,"scale":1.6,"duration":0.65,"hold":1.5}]
```

The renderer clamps focus crops within the screen and applies smoothstep easing to both scale and focus. Keep zoom intervals non-overlapping. For native capture add zooms to the generated compositor storyboard, using captured action timestamps. Check start, midpoint, focus hold and return; ensure the highlighted target stays legible and the cursor points to it throughout.

## Verify

Inspect all three framing choices when changing framing code. Review actual cursor travel and click alignment, dense-page holds, zoom midpoints, intro/outro margins, and final-size readability. A successful encode alone is insufficient. For large desktop recordings use a streaming compositor or short segments if decoding the full take exceeds memory.
