import type { RuntimeMessage } from './shared';

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let analyserL: AnalyserNode | null = null;
let analyserR: AnalyserNode | null = null;
let splitter: ChannelSplitterNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let stream: MediaStream | null = null;
let timeData: Uint8Array | null = null;
let timeDataL: Uint8Array | null = null;
let timeDataR: Uint8Array | null = null;
let intervalId: number | null = null;

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (!('target' in message) || message.target !== 'offscreen') {
    return;
  }

  if (message.type === 'START_CAPTURE') {
    void startCapture(message.streamId);
  } else if (message.type === 'STOP_CAPTURE') {
    void stopCapture();
  }
});

async function startCapture(streamId: string): Promise<void> {
  await stopCapture();

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    } as MediaStreamConstraints);
  } catch (error) {
    console.error('[yt-viz offscreen] getUserMedia failed:', error);
    chrome.runtime.sendMessage({
      type: 'CAPTURE_FAILED',
      reason: String(error),
    } satisfies RuntimeMessage).catch(() => undefined);
    return;
  }

  audioCtx = new AudioContext({ latencyHint: 'interactive' });
  await audioCtx.resume().catch(() => undefined);

  const fftSize = 1024;

  analyser = audioCtx.createAnalyser();
  analyser.smoothingTimeConstant = 0;
  analyser.fftSize = fftSize;

  analyserL = audioCtx.createAnalyser();
  analyserL.smoothingTimeConstant = 0;
  analyserL.fftSize = fftSize;

  analyserR = audioCtx.createAnalyser();
  analyserR.smoothingTimeConstant = 0;
  analyserR.fftSize = fftSize;

  splitter = audioCtx.createChannelSplitter(2);
  source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);
  source.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
  source.connect(audioCtx.destination);

  timeData = new Uint8Array(new ArrayBuffer(fftSize));
  timeDataL = new Uint8Array(new ArrayBuffer(fftSize));
  timeDataR = new Uint8Array(new ArrayBuffer(fftSize));

  intervalId = window.setInterval(() => {
    if (!analyser || !analyserL || !analyserR || !timeData || !timeDataL || !timeDataR) {
      return;
    }

    analyser.getByteTimeDomainData(timeData as unknown as Uint8Array<ArrayBuffer>);
    analyserL.getByteTimeDomainData(timeDataL as unknown as Uint8Array<ArrayBuffer>);
    analyserR.getByteTimeDomainData(timeDataR as unknown as Uint8Array<ArrayBuffer>);

    chrome.runtime.sendMessage({
      type: 'TIME_DATA',
      mono: Array.from(timeData),
      left: Array.from(timeDataL),
      right: Array.from(timeDataR),
    } satisfies RuntimeMessage).catch(() => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    });
  }, 16);
}

async function stopCapture(): Promise<void> {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  if (audioCtx) {
    await audioCtx.close().catch(() => undefined);
    audioCtx = null;
  }

  analyser = null;
  analyserL = null;
  analyserR = null;
  splitter = null;
  source = null;
  timeData = null;
  timeDataL = null;
  timeDataR = null;
}
