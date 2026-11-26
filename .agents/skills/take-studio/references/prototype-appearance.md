# Preserve the live prototype's appearance

## Base Surfaces integration

The bundled [development bridge](../assets/base-surfaces-preview-bridge.ts) reports presentation state and applies the editor’s screen-only preview layout. It contains no account data, cookies or storage export. Check for an existing bridge in the active checkout before adding it; do not install duplicate listeners. Update an older bridge to support the presentation message while retaining project-specific adaptations.

For the React/Vite Base Surfaces mobile prototype, place it in the application's source directory and invoke it once from the entrypoint, behind the development flag:

```ts
import { connectTakeStudioPreview } from './takeStudioPreview';

if (import.meta.env.DEV) {
  const disconnect = connectTakeStudioPreview();
  import.meta.hot?.dispose(disconnect);
}
```

Use the actual filename/path chosen for that project. Keep this development-only. The bundled adapter reads Base Surfaces' own theme class, selected phone label and main phone iframe's dataset/account query. Changing to the capture viewport alone omits the status bar: it belongs to the outer native phone wrapper, not the inner app.

The renderer's Base Surfaces adapter recognises `.df-phone`, `.df-phone__inner`, `.df-picker__chevron` and `iframe[title="Mobile App Preview"]`. It records that existing native wrapper directly, retains its intrinsic dimensions and hides only the surrounding preview controls. These are project-specific selectors, not a universal phone API. For another prototype, inspect its native shell and adapt the reader/capture adapter rather than pretending these selectors apply or constructing replacement UI.

## Appearance message contract

When copying a brief, the editor sends a message to the prototype iframe's exact origin:

```json
{"type":"take-studio:appearance-request","requestId":"<unique request id>"}
```

The bridge responds to the requesting parent's origin with:

```json
{
  "type":"take-studio:appearance",
  "requestId":"<same request id>",
  "appearance":{
    "colourScheme":"dark",
    "nativePhone":true,
    "deviceLabel":"iPhone 17 Pro",
    "appSearch":"?mode=app&dataset=<active dataset>"
  }
}
```

The example's theme/device/dataset are illustrative. Read the actual preview. The bundled bridge only accepts requests from its parent at a local `http://127.0.0.1` address. The editor checks message source, origin and request ID. Retain those checks when adapting it. Never use this channel to collect unrelated storage or credentials.

The saved `brief.json` is authoritative for the requested capture. Confirm its appearance agrees with the preview, especially after changing theme or device. An unavailable bridge falls back to a system preference with `appearance.verified: false`; that is explicitly unverified, not proof of the prototype's actual appearance. Inspect or clarify before rendering. Do not change an established device or dataset merely to make a selector match.

## Rehearse and verify

- Rehearse the same entry route, theme, device and dataset that will be captured. Native framing takes precedence over the generic 390 × 844 app-only size when matching the phone preview.
- Check assets in the app and outer phone shell, including status-bar icons. Configure only observed asset origins through `TAKE_ASSET_ORIGINS` and keep the recorder's readiness checks.
- Preserve CSS/WAAPI easing and durations. JavaScript clocks and animation timelines advance together in the offline renderer; longer rendering time must not change playback timing.
- Inspect opening, transition midpoints and ending. Verify the theme and status bar through modal transitions, not just on Home.
- Read the capture manifest. At normal speed the source sample rate is 60. With a selected playback speed, the source sample rate adjusts so each output second still has 60 sampled frames.
- Verify distinct source hashes and decoded frames in moving regions. Repeated static holds are expected. A 60 fps file header alone is not sufficient evidence.

Animated raster images, video/audio media and externally driven clocks are outside the verified timeline sources. Test them separately and disclose a specific limitation rather than calling duplicated or interpolated footage native 60 fps.

## Editor presentation

On iframe load, the editor sends `{"type":"take-studio:presentation"}` to the prototype’s exact origin. The adapter uses the same parent/origin checks as appearance requests. It centres the existing screen and native status bar against the dark canvas and hides the surrounding device bezel and gallery controls for the editor preview. It does not reload the inner app, replace its content or force its theme. Resize handling keeps the screen centred; opening the settings panel does not resize the prototype. All presentation styles/listeners are removed on development hot disposal. This editor layout does not rewrite existing video briefs or their saved native export framing.
