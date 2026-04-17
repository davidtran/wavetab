import {
  DEFAULT_SETTINGS,
  isYouTubeWatchUrl,
  normalizeSettings,
  type RuntimeMessage,
  type VizSettings,
  type VizStatus,
} from './shared';

type StatusPayload = {
  status: VizStatus;
  settings: VizSettings;
};

type ToggleResponse = {
  ok: boolean;
  reason?: string;
  status?: VizStatus;
  settings?: VizSettings;
};

const autoRandomInput = document.getElementById('auto-random') as HTMLInputElement | null;
const switchIntervalInput = document.getElementById('switch-interval') as HTMLInputElement | null;
const modeInputFull = document.getElementById('display-mode-full') as HTMLInputElement | null;
const modeInputCorner = document.getElementById('display-mode-corner') as HTMLInputElement | null;
const statusEl = document.getElementById('status') as HTMLParagraphElement | null;
const toggleButton = document.getElementById('toggle-current-tab') as HTMLButtonElement | null;
const helperEl = document.getElementById('helper') as HTMLParagraphElement | null;

let currentSettings = DEFAULT_SETTINGS;
let currentStatus: VizStatus = { activeTabId: null, isActive: false };
let currentTabId: number | null = null;
let currentTabIsWatchPage = false;

void initialize();

async function initialize(): Promise<void> {
  bindEvents();

  await refreshActiveTab();

  const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' } satisfies RuntimeMessage) as StatusPayload;
  currentSettings = normalizeSettings(response.settings);
  currentStatus = response.status;
  renderSettings();
  renderStatus();

  chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type !== 'STATUS_CHANGED') {
      return;
    }

    currentSettings = normalizeSettings(message.settings);
    currentStatus = message.status;
    renderSettings();
    renderStatus();
  });
}

function bindEvents(): void {
  toggleButton?.addEventListener('click', () => {
    void toggleCurrentTab();
  });

  autoRandomInput?.addEventListener('change', () => {
    void persistSettings({ autoRandom: autoRandomInput.checked });
  });

  switchIntervalInput?.addEventListener('change', () => {
    void persistSettings({ switchIntervalSeconds: Number(switchIntervalInput.value) });
  });

  modeInputFull?.addEventListener('change', () => {
    if (modeInputFull.checked) {
      void persistSettings({ displayMode: 'full' });
    }
  });

  modeInputCorner?.addEventListener('change', () => {
    if (modeInputCorner.checked) {
      void persistSettings({ displayMode: 'corner' });
    }
  });
}

async function persistSettings(patch: Partial<VizSettings>): Promise<void> {
  currentSettings = normalizeSettings({ ...currentSettings, ...patch });
  renderSettings();
  const saved = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    settings: currentSettings,
  } satisfies RuntimeMessage) as VizSettings;
  currentSettings = normalizeSettings(saved);
  renderSettings();
}

async function toggleCurrentTab(): Promise<void> {
  await refreshActiveTab();
  if (!currentTabIsWatchPage || currentTabId === null || !toggleButton) {
    renderStatus('Open a YouTube watch page in the active tab first.');
    return;
  }

  toggleButton.disabled = true;
  const response = await chrome.runtime.sendMessage({
    type: 'TOGGLE_VIZ',
    tabId: currentTabId,
  } satisfies RuntimeMessage) as ToggleResponse;

  toggleButton.disabled = false;

  if (!response.ok) {
    renderStatus(response.reason || 'Chrome blocked tab capture for this tab.');
    return;
  }

  if (response.status) {
    currentStatus = response.status;
  }
  if (response.settings) {
    currentSettings = normalizeSettings(response.settings);
  }

  renderSettings();
  renderStatus();
}

async function refreshActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  currentTabIsWatchPage = isYouTubeWatchUrl(tab?.url);
}

function renderSettings(): void {
  if (autoRandomInput) {
    autoRandomInput.checked = currentSettings.autoRandom;
  }
  if (switchIntervalInput) {
    switchIntervalInput.value = String(currentSettings.switchIntervalSeconds);
    switchIntervalInput.disabled = !currentSettings.autoRandom;
  }
  if (modeInputFull) {
    modeInputFull.checked = currentSettings.displayMode === 'full';
  }
  if (modeInputCorner) {
    modeInputCorner.checked = currentSettings.displayMode === 'corner';
  }
}

function renderStatus(overrideMessage?: string): void {
  if (!statusEl) {
    return;
  }

  const isActiveOnCurrentTab = currentTabId !== null && currentStatus.activeTabId === currentTabId;

  if (toggleButton) {
    toggleButton.disabled = !currentTabIsWatchPage;
    toggleButton.textContent = isActiveOnCurrentTab ? 'Turn Off On This Tab' : 'Enable On This Tab';
  }

  if (helperEl) {
    helperEl.textContent = currentTabIsWatchPage
      ? 'Use this popup to start the visualizer for the current YouTube tab. Chrome requires the capture grant to begin from the extension popup.'
      : 'Switch to a YouTube watch page, then use the button above to grant capture for that tab.';
  }

  if (overrideMessage) {
    statusEl.textContent = overrideMessage;
    return;
  }

  if (currentStatus.activeTabId !== null) {
    statusEl.textContent = isActiveOnCurrentTab
      ? 'Visualizer is active on this YouTube tab.'
      : 'Visualizer is active on another YouTube tab.';
    return;
  }

  statusEl.textContent = currentTabIsWatchPage
    ? 'Open this popup and click Enable On This Tab to start the visualizer.'
    : 'Open a YouTube watch page to enable the visualizer for the current tab.';
}
