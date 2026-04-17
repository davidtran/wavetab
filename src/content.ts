import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type RuntimeMessage,
  type VizSettings,
} from './shared';

declare global {
  interface Window {
    __YT_VIZ_CONTENT__?: boolean;
    __ytVizUpdateLabel?: (label: string) => void;
  }
}

if (!window.__YT_VIZ_CONTENT__) {
  window.__YT_VIZ_CONTENT__ = true;
  bootstrap();
}

function bootstrap(): void {
  const IFRAME_ID = 'yt-viz-iframe';
  const HUD_ID = 'yt-viz-hud';
  const CONTROLS_ID = 'yt-viz-controls';

  let iframe: HTMLIFrameElement | null = null;
  let hud: HTMLDivElement | null = null;
  let controls: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let sandboxReady = false;
  let pendingInit: { type: 'INIT'; width: number; height: number; settings: VizSettings } | null = null;
  let syncInterval: number | null = null;
  let reconcileScheduled = false;
  let isActive = false;
  let settings: VizSettings = DEFAULT_SETTINGS;
  let currentPresetName = '';
  let lastUrl = location.href;

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (!message?.type) {
      return;
    }

    switch (message.type) {
      case 'PING':
        sendResponse({ ok: true });
        return true;
      case 'STATE_SYNC':
        settings = normalizeSettings(message.settings);
        isActive = message.active;
        if (isActive) {
          ensureVisualizer();
          applySettingsToSandbox();
        } else {
          stop();
        }
        break;
      case 'TIME_DATA':
        if (iframe && sandboxReady) {
          iframe.contentWindow?.postMessage({
            type: 'TIME_DATA',
            mono: message.mono,
            left: message.left,
            right: message.right,
          }, '*');
        }
        break;
      case 'VIZ_ERROR':
        showToast('Visualizer failed: ' + (message.reason || 'unknown'));
        stop();
        break;
      default:
        break;
    }

    return false;
  });

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message?.type) {
      return;
    }

    if (message.type === 'SANDBOX_READY') {
      sandboxReady = true;
      if (pendingInit && iframe) {
        iframe.contentWindow?.postMessage(pendingInit, '*');
        pendingInit = null;
      }
      applySettingsToSandbox();
      return;
    }

    if (message.type === 'PRESET_INFO') {
      currentPresetName = message.name;
      flashHud(message.name);
      return;
    }

    if (message.type === 'VIZ_ERROR') {
      showToast(message.reason || 'Visualizer error');
      stop();
    }
  });

  document.addEventListener('fullscreenchange', scheduleReconcile);
  document.addEventListener('keydown', onKeyDown, true);

  const observer = new MutationObserver(() => {
    scheduleReconcile();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleReconcile();
    }
  }, 500);

  void chrome.runtime.sendMessage({ type: 'CONTENT_READY' } satisfies RuntimeMessage).catch(() => undefined);
  scheduleReconcile();

  function scheduleReconcile(): void {
    if (reconcileScheduled) {
      return;
    }

    reconcileScheduled = true;
    window.requestAnimationFrame(() => {
      reconcileScheduled = false;
      if (isActive) {
        ensureVisualizer();
      }
    });
  }

  function ensureVisualizer(): void {
    const player = findPlayer();
    const video = findVideo();
    if (!player || !video) {
      return;
    }

    if (!iframe) {
      sandboxReady = false;
      iframe = document.createElement('iframe');
      iframe.id = IFRAME_ID;
      iframe.src = chrome.runtime.getURL('sandbox.html');
      iframe.setAttribute('sandbox', 'allow-scripts');
      player.appendChild(iframe);

      hud = document.createElement('div');
      hud.id = HUD_ID;
      player.appendChild(hud);

      controls = buildControls();
      player.appendChild(controls);

      resizeObserver = new ResizeObserver(() => {
        syncSize();
      });
      resizeObserver.observe(video);
      resizeObserver.observe(player);

      syncInterval = window.setInterval(syncSize, 500);
    } else if (!player.contains(iframe)) {
      player.appendChild(iframe);
      if (hud) {
        player.appendChild(hud);
      }
      if (controls) {
        player.appendChild(controls);
      }
    }

    syncSize();
    applySettingsToSandbox();
  }

  function stop(): void {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    if (syncInterval !== null) {
      window.clearInterval(syncInterval);
      syncInterval = null;
    }

    if (iframe && sandboxReady) {
      iframe.contentWindow?.postMessage({ type: 'DESTROY' }, '*');
    }

    iframe?.remove();
    hud?.remove();
    controls?.remove();

    iframe = null;
    hud = null;
    controls = null;
    sandboxReady = false;
    pendingInit = null;
    currentPresetName = '';
  }

  function syncSize(): void {
    if (!iframe || !controls) {
      return;
    }

    const player = findPlayer();
    const video = findVideo();
    if (!player || !video) {
      return;
    }

    const bounds = getVisualizerBounds(player, video);
    iframe.style.left = bounds.left + 'px';
    iframe.style.top = bounds.top + 'px';
    iframe.style.width = bounds.width + 'px';
    iframe.style.height = bounds.height + 'px';
    iframe.classList.toggle('yt-viz-mode-corner', settings.displayMode === 'corner');

    controls.style.left = bounds.left + 'px';
    controls.style.top = bounds.top + 'px';
    controls.style.width = bounds.width + 'px';
    controls.style.height = bounds.height + 'px';
    controls.classList.toggle('yt-viz-mode-corner', settings.displayMode === 'corner');

    const initMessage = {
      type: 'INIT',
      width: bounds.width,
      height: bounds.height,
      settings,
    } as const;

    if (sandboxReady) {
      iframe.contentWindow?.postMessage({ type: 'RESIZE', width: bounds.width, height: bounds.height }, '*');
    } else {
      pendingInit = initMessage;
    }
  }

  function getVisualizerBounds(player: HTMLElement, video: HTMLVideoElement): { left: number; top: number; width: number; height: number } {
    const playerRect = player.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const baseLeft = Math.round(videoRect.left - playerRect.left);
    const baseTop = Math.round(videoRect.top - playerRect.top);
    const fullWidth = Math.max(1, Math.round(videoRect.width));
    const fullHeight = Math.max(1, Math.round(videoRect.height));

    if (settings.displayMode === 'full') {
      return {
        left: baseLeft,
        top: baseTop,
        width: fullWidth,
        height: fullHeight,
      };
    }

    const inset = Math.max(8, Math.round(Math.min(fullWidth, fullHeight) * 0.03));
    const width = Math.min(fullWidth - inset * 2, Math.max(180, Math.round(fullWidth * 0.34)));
    const height = Math.min(fullHeight - inset * 2, Math.max(120, Math.round(fullHeight * 0.34)));

    return {
      left: baseLeft + inset,
      top: baseTop + inset,
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  function buildControls(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.id = CONTROLS_ID;

    const bar = document.createElement('div');
    bar.className = 'yt-viz-bar';

    const prev = makeButton('Prev', 'Previous preset', () => {
      sendToSandbox({ type: 'PREV_PRESET' });
    });

    const next = makeButton('Next', 'Next preset', () => {
      sendToSandbox({ type: 'NEXT_PRESET' });
    });

    const close = makeButton('Close', 'Turn off visualizer', () => {
      void chrome.runtime.sendMessage({ type: 'VIZ_CLOSE' } satisfies RuntimeMessage).catch(() => undefined);
    });
    close.classList.add('yt-viz-btn-close');

    const label = document.createElement('div');
    label.className = 'yt-viz-label';

    bar.appendChild(prev);
    bar.appendChild(next);
    bar.appendChild(label);
    bar.appendChild(close);
    wrapper.appendChild(bar);

    window.__ytVizUpdateLabel = (name: string) => {
      label.textContent = name;
    };

    return wrapper;
  }

  function makeButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'yt-viz-btn';
    button.type = 'button';
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function applySettingsToSandbox(): void {
    if (!iframe) {
      return;
    }

    if (sandboxReady) {
      iframe.contentWindow?.postMessage({ type: 'APPLY_SETTINGS', settings }, '*');
      syncSize();
      return;
    }

    const player = findPlayer();
    const video = findVideo();
    if (!player || !video) {
      return;
    }

    const bounds = getVisualizerBounds(player, video);
    pendingInit = {
      type: 'INIT',
      width: bounds.width,
      height: bounds.height,
      settings,
    };
  }

  function sendToSandbox(message: { type: 'PREV_PRESET' | 'NEXT_PRESET' | 'RANDOM_PRESET' }): void {
    if (iframe && sandboxReady) {
      iframe.contentWindow?.postMessage(message, '*');
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (!iframe || !sandboxReady || !isActive) {
      return;
    }

    if (event.key === 'v' || event.key === 'V') {
      event.stopPropagation();
      sendToSandbox({ type: 'NEXT_PRESET' });
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      event.stopPropagation();
      sendToSandbox({ type: 'RANDOM_PRESET' });
    }
  }

  function flashHud(name: string): void {
    currentPresetName = name || currentPresetName || 'unknown';
    if (window.__ytVizUpdateLabel) {
      window.__ytVizUpdateLabel(currentPresetName);
    }
    if (!hud) {
      return;
    }

    hud.textContent = currentPresetName + '  [V: next | R: random]';
    hud.classList.remove('yt-viz-hud-show');
    void hud.offsetWidth;
    hud.classList.add('yt-viz-hud-show');
  }

  function showToast(text: string): void {
    const toast = document.createElement('div');
    toast.className = 'yt-viz-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  function findPlayer(): HTMLElement | null {
    return document.querySelector('#movie_player');
  }

  function findVideo(): HTMLVideoElement | null {
    return document.querySelector('#movie_player video');
  }
}
