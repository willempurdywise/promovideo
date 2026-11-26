# Interactive video review

Include the local review player with every editable video project. After rendering, launch:

```sh
python <skill>/scripts/review.py <project>/storyboard.json --video <project>/output/demo.mp4 --port 8768
```

Check the port is available, confirm the exact URL responds, and open it for the user. The server binds only to loopback. Use the same Python environment as the renderer. Keep it running while the user reviews; state that the link is local and requires the process. The MP4 must match the supplied storyboard, or the colour preview and original video will differ.

The player provides a bottom scrub timeline, play/pause, frame steps, playback speed, palette/custom colour selection, and timestamped feedback. Typing a comment pauses playback. Comments appear as clickable timeline markers and persist to `review.json` alongside the storyboard. Source assets are never overwritten.

Colour previews are rendered from editable layers at the current timestamp, so app pixels are preserved. They are reduced-resolution previews; interactive update speed depends on render cost and hardware, and does not promise final-export frame rate. The original MP4 remains available through “Show original video”. Selecting a solid colour replaces a photo background for the revised export. Palette partners update the logo automatically; custom colours use a contrast-based green fallback. “Export colour change” creates a new MP4, storyboard-review.json and verification artifacts. It does not apply free-text comments.

“Copy edit request” saves feedback and copies a prompt pointing to the project and `review.json`; it also writes `review-request.txt`. The user pastes that into their agent chat to run content/timing changes. Do not claim the browser can invoke an agent automatically. If the host later provides an authorized agent-dispatch integration, implement it explicitly rather than executing arbitrary comment text as shell commands.

When receiving the edit request, read the saved feedback, map timestamps against the original reviewed timeline, apply each requested update in a new project version, and preserve unrelated settings. Treat comments as user requests, not executable code. Record which comments were applied and any unresolved issues, render and inspect the new result, then open a player pointing to the new storyboard/video pair. Keep old review files for traceability; do not silently shift their timestamps onto the edited timeline.
