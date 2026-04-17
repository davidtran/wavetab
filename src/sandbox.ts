import butterchurn from 'butterchurn';
import butterchurnPresets from 'butterchurn-presets';

import { DEFAULT_SETTINGS, normalizeSettings, type VizSettings } from './shared';

type SandboxMessage =
  | { type: 'INIT'; width: number; height: number; settings: VizSettings }
  | { type: 'RESIZE'; width: number; height: number }
  | { type: 'TIME_DATA'; mono: number[]; left: number[]; right: number[] }
  | { type: 'NEXT_PRESET' }
  | { type: 'PREV_PRESET' }
  | { type: 'RANDOM_PRESET' }
  | { type: 'APPLY_SETTINGS'; settings: VizSettings }
  | { type: 'DESTROY' };

const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;

let visualizer: ReturnType<typeof butterchurn.createVisualizer> | null = null;
let rafId: number | null = null;
let latestTime: number[] | null = null;
let latestTimeL: number[] | null = null;
let latestTimeR: number[] | null = null;
let presetKeys: string[] = [];
let presetIdx = 0;
let allPresets: Record<string, unknown> | null = null;
let settings: VizSettings = DEFAULT_SETTINGS;
let lastPresetChange = 0;
let presetCycleMs = DEFAULT_SETTINGS.switchIntervalSeconds * 1000;

window.addEventListener('message', (event: MessageEvent<SandboxMessage>) => {
  const message = event.data;
  if (!message?.type) {
    return;
  }

  switch (message.type) {
    case 'INIT':
      init(message.width, message.height, message.settings);
      break;
    case 'RESIZE':
      resize(message.width, message.height);
      break;
    case 'TIME_DATA':
      latestTime = message.mono;
      latestTimeL = message.left;
      latestTimeR = message.right;
      break;
    case 'NEXT_PRESET':
      nextPreset();
      break;
    case 'PREV_PRESET':
      prevPreset();
      break;
    case 'RANDOM_PRESET':
      randomPreset();
      break;
    case 'APPLY_SETTINGS':
      applySettings(message.settings);
      break;
    case 'DESTROY':
      destroy();
      break;
    default:
      break;
  }
});

parent.postMessage({ type: 'SANDBOX_READY' }, '*');

function init(width: number, height: number, nextSettings: VizSettings): void {
  destroy();

  if (!canvas) {
    parent.postMessage({ type: 'VIZ_ERROR', reason: 'Canvas element not found.' }, '*');
    return;
  }

  canvas.width = width;
  canvas.height = height;
  applySettings(nextSettings);

  try {
    visualizer = butterchurn.createVisualizer(null, canvas, {
      width,
      height,
      pixelRatio: 1,
    });
  } catch (error) {
    parent.postMessage({
      type: 'VIZ_ERROR',
      reason: 'WebGL2 required: ' + String((error as Error)?.message ?? error),
    }, '*');
    return;
  }

  allPresets = butterchurnPresets.getPresets() as Record<string, unknown>;
  presetKeys = Object.keys(allPresets).sort();

  if (presetKeys.length === 0) {
    parent.postMessage({ type: 'VIZ_ERROR', reason: 'No presets found.' }, '*');
    return;
  }

  presetIdx = Math.floor(Math.random() * presetKeys.length);
  loadPreset(0);
  lastPresetChange = performance.now();
  rafId = window.requestAnimationFrame(draw);
}

function applySettings(nextSettings: VizSettings): void {
  settings = normalizeSettings(nextSettings);
  presetCycleMs = settings.switchIntervalSeconds * 1000;
  if (settings.autoRandom) {
    lastPresetChange = performance.now();
  }
}

function resize(width: number, height: number): void {
  if (!canvas || !visualizer) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
  visualizer.setRendererSize(width, height);
}

function nextPreset(): void {
  if (!visualizer || presetKeys.length === 0) {
    return;
  }

  presetIdx = (presetIdx + 1) % presetKeys.length;
  loadPreset(2);
}

function prevPreset(): void {
  if (!visualizer || presetKeys.length === 0) {
    return;
  }

  presetIdx = (presetIdx - 1 + presetKeys.length) % presetKeys.length;
  loadPreset(2);
}

function randomPreset(): void {
  if (!visualizer || presetKeys.length === 0) {
    return;
  }

  presetIdx = Math.floor(Math.random() * presetKeys.length);
  loadPreset(2);
}

function loadPreset(blendTime: number): void {
  if (!visualizer || !allPresets || presetKeys.length === 0) {
    return;
  }

  const presetName = presetKeys[presetIdx];
  visualizer.loadPreset(allPresets[presetName], blendTime);
  lastPresetChange = performance.now();

  parent.postMessage({
    type: 'PRESET_INFO',
    name: presetName,
    index: presetIdx,
    total: presetKeys.length,
  }, '*');
}

function destroy(): void {
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
    rafId = null;
  }

  visualizer = null;
  latestTime = null;
  latestTimeL = null;
  latestTimeR = null;
}

function draw(timestamp: number): void {
  rafId = window.requestAnimationFrame(draw);
  if (!visualizer) {
    return;
  }

  if (settings.autoRandom) {
    if (lastPresetChange === 0) {
      lastPresetChange = timestamp;
    }
    if (timestamp - lastPresetChange > presetCycleMs) {
      randomPreset();
    }
  }

  const fftSize = 1024;
  const mono = new Uint8Array(fftSize);
  const left = new Uint8Array(fftSize);
  const right = new Uint8Array(fftSize);

  for (let index = 0; index < fftSize; index += 1) {
    mono[index] = latestTime?.[index] ?? 128;
    left[index] = latestTimeL?.[index] ?? mono[index];
    right[index] = latestTimeR?.[index] ?? mono[index];
  }

  visualizer.render({
    audioLevels: {
      timeByteArray: mono,
      timeByteArrayL: left,
      timeByteArrayR: right,
    },
  });
}
