# WaveTab

Open-source Chrome extension that turns YouTube audio into a vivid visualizer. WaveTab runs inside the player, survives YouTube SPA navigation more reliably, and starts from the extension popup because Chrome requires tab capture to begin from an extension surface.

## Features

- First-run onboarding page that opens automatically after install.
- Popup control to start or stop the visualizer for the current YouTube tab.
- Popup settings for random preset switching, switch interval, and display mode.
- Two display modes: whole-video overlay and top-left corner overlay.
- Butterchurn-powered preset rendering in a sandboxed iframe.
- Offscreen audio capture so playback audio continues normally.
- TypeScript source with a build that outputs a clean `dist/` extension folder.

## Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the extension:
   ```bash
   npm run build
   ```
3. For a full check before publishing:
   ```bash
   npm run check
   ```

## Load Unpacked

1. Build the project so `dist/` exists.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `dist/` folder.

## Use

1. Open any YouTube watch page.
2. Click the extension icon to open the popup.
3. Click **Enable On This Tab** to start the visualizer.
4. Configure the popup settings for:
   - random preset switching
   - time between preset switches
   - display mode: whole video or top-left corner
5. Use the overlay controls or press `V` for the next preset and `R` for a random preset while the player is focused.

## Architecture

```text
Extension popup -> background service worker -> offscreen document -> tab audio capture
                                        -> content script -> sandbox iframe -> butterchurn renderer
```

- `src/background.ts` owns visualizer lifecycle, content-script reinjection, storage sync, and offscreen coordination.
- `src/content.ts` mounts the overlay, keeps it aligned with the current video, and handles in-video preset controls.
- `src/offscreen.ts` captures tab audio and streams time-domain data to the active tab.
- `src/sandbox.ts` runs butterchurn in a sandbox where the renderer can execute safely.
- `src/popup.ts` powers the extension popup settings UI.
- `onboarding.html` is the first-run setup guide opened after install.

## Reliability Notes

- Existing YouTube tabs can be fixed without a full page reload because the background reinjects the content script when needed.
- SPA navigation is handled by re-syncing state when YouTube swaps player DOM or the active watch URL changes.
- Tab capture must be started from the popup because Chrome does not treat clicks on injected page UI as extension invocations.
- DRM-protected YouTube content may still produce silent capture streams because `tabCapture` cannot bypass EME restrictions.

## Publishing

Before pushing to GitHub, make sure `npm run check` passes and that you include the `dist/` build output only if you want consumers to load the unpacked extension without building locally. The default repository setup ignores `dist/` and treats it as a build artifact.

## License

MIT.
