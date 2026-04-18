# WaveTab Privacy Policy

Last updated: April 18, 2026

## Overview

WaveTab is a browser extension that turns audio from the current YouTube tab into a visualizer overlay. WaveTab processes audio and settings locally in the user's browser.

WaveTab does not sell personal information, does not use advertising trackers, and does not upload captured audio to remote servers.

## Information We Collect

WaveTab is designed to minimize data collection.

WaveTab stores only the settings needed to run the extension, such as:

- whether random preset switching is enabled
- the preset switch interval
- the selected display mode

These settings are stored using Chrome extension storage so the extension can remember the user's preferences.

## Information We Do Not Collect

WaveTab does not collect, store, or transmit:

- personal identity information
- account credentials
- browsing history outside the extension's required YouTube scope
- the contents of YouTube audio or video streams
- analytics, tracking data, or advertising identifiers

## How WaveTab Uses Permissions

### `tabCapture`

Used to access audio from the current YouTube tab after the user explicitly starts WaveTab from the extension popup. This audio is analyzed locally to drive the visualizer.

### `offscreen`

Used to run an offscreen document that hosts the browser audio processing graph required for visualization.

### `activeTab`

Used so WaveTab operates only on the tab the user explicitly activates from the extension popup.

### `storage`

Used to save the user's visualizer preferences.

### `scripting`

Used to inject or reinject the extension's local content script and stylesheet into the active YouTube tab so the visualizer overlay can render correctly.

### `*://*.youtube.com/*`

Used because WaveTab works only on YouTube pages and needs access to the YouTube player in order to render the visualizer on top of the video.

## How Data Is Processed

WaveTab processes captured YouTube tab audio locally on the user's device. The extension uses that audio data only to render visual effects in real time.

WaveTab does not send captured audio, derived visualizer data, or user settings to external servers.

## Third-Party Code

WaveTab includes third-party libraries packaged with the extension build. Those libraries are shipped as part of the extension and are not loaded remotely at runtime.

## Data Sharing

WaveTab does not share user data with third parties because it does not collect user data beyond local extension settings.

## Data Retention

WaveTab retains only the settings stored in the browser's extension storage until the user changes them or removes the extension.

## User Controls

Users can:

- disable or remove the extension at any time
- clear stored extension settings by removing the extension or resetting extension storage
- control when tab audio capture starts by using the extension popup

## Children's Privacy

WaveTab is not directed to children and does not knowingly collect personal information from children.

## Changes to This Policy

If this privacy policy changes, the updated version will be published with a new "Last updated" date.

## Contact

For questions about this privacy policy, contact the developer through the repository or store listing where WaveTab is published.