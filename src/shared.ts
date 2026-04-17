export type DisplayMode = 'full' | 'corner';

export interface VizSettings {
  autoRandom: boolean;
  switchIntervalSeconds: number;
  displayMode: DisplayMode;
}

export interface VizStatus {
  activeTabId: number | null;
  isActive: boolean;
}

export const DEFAULT_SETTINGS: VizSettings = {
  autoRandom: true,
  switchIntervalSeconds: 30,
  displayMode: 'full',
};

export type RuntimeMessage =
  | { type: 'PING' }
  | { type: 'CONTENT_READY' }
  | { type: 'TOGGLE_VIZ'; tabId?: number }
  | { type: 'VIZ_CLOSE' }
  | { type: 'GET_SETTINGS' }
  | { type: 'GET_STATUS' }
  | { type: 'SAVE_SETTINGS'; settings: Partial<VizSettings> }
  | { type: 'STATE_SYNC'; active: boolean; settings: VizSettings }
  | { type: 'STATUS_CHANGED'; status: VizStatus; settings: VizSettings }
  | { type: 'TIME_DATA'; mono: number[]; left: number[]; right: number[] }
  | { type: 'CAPTURE_FAILED'; reason: string }
  | { type: 'VIZ_ERROR'; reason?: string }
  | { type: 'START_CAPTURE'; streamId: string; target: 'offscreen' }
  | { type: 'STOP_CAPTURE'; target: 'offscreen' };

export function normalizeSettings(raw: Partial<VizSettings> | undefined): VizSettings {
  const nextAutoRandom = raw?.autoRandom ?? DEFAULT_SETTINGS.autoRandom;
  const nextDisplayMode = raw?.displayMode === 'corner' ? 'corner' : 'full';
  const parsedInterval = Number(raw?.switchIntervalSeconds);
  const switchIntervalSeconds = Number.isFinite(parsedInterval)
    ? Math.min(300, Math.max(5, Math.round(parsedInterval)))
    : DEFAULT_SETTINGS.switchIntervalSeconds;

  return {
    autoRandom: Boolean(nextAutoRandom),
    switchIntervalSeconds,
    displayMode: nextDisplayMode,
  };
}

export async function loadSettings(): Promise<VizSettings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  const normalized = normalizeSettings(stored as Partial<VizSettings>);
  if (
    stored.autoRandom !== normalized.autoRandom ||
    stored.switchIntervalSeconds !== normalized.switchIntervalSeconds ||
    stored.displayMode !== normalized.displayMode
  ) {
    await chrome.storage.sync.set(normalized);
  }
  return normalized;
}

export async function saveSettings(settings: Partial<VizSettings>): Promise<VizSettings> {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...settings });
  await chrome.storage.sync.set(next);
  return next;
}

export function isYouTubeWatchUrl(url: string | undefined | null): boolean {
  return typeof url === 'string' && /^https?:\/\/([^/]+\.)?youtube\.com\/watch/.test(url);
}
