import {
  type RuntimeMessage,
  type VizSettings,
  type VizStatus,
  isYouTubeWatchUrl,
  loadSettings,
  saveSettings,
} from './shared';

const OFFSCREEN_URL = 'offscreen.html';
const ONBOARDING_URL = 'onboarding.html';

let activeTabId: number | null = null;

void initializeDefaults();

chrome.runtime.onInstalled.addListener((details) => {
  void initializeDefaults();
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_URL) });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void initializeDefaults();
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (!message?.type) {
    return;
  }

  if (message.type === 'TIME_DATA' && activeTabId !== null) {
    chrome.tabs.sendMessage(activeTabId, message).catch(() => undefined);
    return;
  }

  if (message.type === 'CAPTURE_FAILED') {
    void handleCaptureFailed(message.reason);
    return;
  }

  void (async () => {
    switch (message.type) {
      case 'CONTENT_READY': {
        if (sender.tab?.id !== undefined) {
          await syncStateToTab(sender.tab.id);
        }
        sendResponse({ ok: true });
        break;
      }
      case 'TOGGLE_VIZ': {
        const targetTabId = message.tabId ?? sender.tab?.id;
        if (targetTabId === undefined) {
          sendResponse({ ok: false, reason: 'No target tab found.' });
          break;
        }
        await toggleForTab(targetTabId);
        sendResponse({ ok: true, status: getStatus(targetTabId), settings: await loadSettings() });
        break;
      }
      case 'VIZ_CLOSE': {
        await stop();
        sendResponse({ ok: true });
        break;
      }
      case 'GET_SETTINGS': {
        sendResponse(await loadSettings());
        break;
      }
      case 'SAVE_SETTINGS': {
        const settings = await saveSettings(message.settings);
        await broadcastStatus(settings);
        if (activeTabId !== null) {
          await syncStateToTab(activeTabId, settings);
        }
        sendResponse(settings);
        break;
      }
      case 'GET_STATUS': {
        const currentTabId = sender.tab?.id ?? null;
        sendResponse({
          status: getStatus(currentTabId),
          settings: await loadSettings(),
        });
        break;
      }
      default: {
        break;
      }
    }
  })().catch((error) => {
    console.error('[yt-viz] background message failed:', error);
    sendResponse({ ok: false, reason: String(error) });
  });

  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }

  if (!('autoRandom' in changes || 'switchIntervalSeconds' in changes || 'displayMode' in changes)) {
    return;
  }

  void (async () => {
    const settings = await loadSettings();
    if (activeTabId !== null) {
      await syncStateToTab(activeTabId, settings);
    }
    await broadcastStatus(settings);
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    void stop();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== activeTabId) {
    return;
  }

  const nextUrl = changeInfo.url ?? tab.url;
  if (nextUrl && !isYouTubeWatchUrl(nextUrl)) {
    void stop();
    return;
  }

  if (changeInfo.status === 'complete' && nextUrl && isYouTubeWatchUrl(nextUrl)) {
    void syncStateToTab(tabId);
  }
});

async function initializeDefaults(): Promise<void> {
  await loadSettings();
}

async function toggleForTab(tabId: number): Promise<void> {
  if (activeTabId === tabId) {
    await stop();
    return;
  }

  await start(tabId);
}

async function start(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.id || !isYouTubeWatchUrl(tab.url)) {
    return;
  }

  const previousTabId = activeTabId;
  if (previousTabId !== null && previousTabId !== tabId) {
    await stop();
  }

  try {
    await ensureContentScript(tabId);
    await ensureOffscreen();

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });

    activeTabId = tabId;
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'START_CAPTURE',
      streamId,
    } satisfies RuntimeMessage);

    const settings = await loadSettings();
    await syncStateToTab(tabId, settings);
    await broadcastStatus(settings);
  } catch (error) {
    console.error('[yt-viz] start failed:', error);
    await stop();
    throw error;
  }
}

async function stop(): Promise<void> {
  const tabId = activeTabId;
  activeTabId = null;

  try {
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'STOP_CAPTURE',
    } satisfies RuntimeMessage);
  } catch {
    // Offscreen document may already be gone.
  }

  await closeOffscreen();

  const settings = await loadSettings();
  if (tabId !== null) {
    await syncStateToTab(tabId, settings);
  }
  await broadcastStatus(settings);
}

async function handleCaptureFailed(reason: string): Promise<void> {
  const tabId = activeTabId;
  if (tabId !== null) {
    chrome.tabs.sendMessage(tabId, { type: 'VIZ_ERROR', reason } satisfies RuntimeMessage).catch(() => undefined);
  }
  await stop();
}

async function syncStateToTab(tabId: number, settings?: VizSettings): Promise<void> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }

  if (!isYouTubeWatchUrl(tab.url)) {
    return;
  }

  const nextSettings = settings ?? (await loadSettings());
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, {
    type: 'STATE_SYNC',
    active: activeTabId === tabId,
    settings: nextSettings,
  } satisfies RuntimeMessage).catch(() => undefined);
}

async function broadcastStatus(settings?: VizSettings): Promise<void> {
  const nextSettings = settings ?? (await loadSettings());
  await chrome.runtime.sendMessage({
    type: 'STATUS_CHANGED',
    status: getStatus(null),
    settings: nextSettings,
  } satisfies RuntimeMessage).catch(() => undefined);
}

function getStatus(currentTabId: number | null): VizStatus {
  return {
    activeTabId,
    isActive: activeTabId !== null && currentTabId === activeTabId,
  };
}

async function ensureContentScript(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!isYouTubeWatchUrl(tab.url)) {
    throw new Error('This tab is not a YouTube watch page.');
  }

  if (await pingContent(tabId)) {
    return;
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content.css'],
  }).catch(() => undefined);

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await pingContent(tabId)) {
      return;
    }

    await wait(150);
  }

  throw new Error('Content script did not respond after injection.');
}

async function pingContent(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' } satisfies RuntimeMessage);
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

async function ensureOffscreen(): Promise<void> {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Capture YouTube tab audio for the visualizer overlay.',
  });
}

async function closeOffscreen(): Promise<void> {
  try {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (hasDocument) {
      await chrome.offscreen.closeDocument();
    }
  } catch {
    // Ignore teardown errors.
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
