declare module 'butterchurn' {
  interface ButterchurnAudioLevels {
    timeByteArray: Uint8Array;
    timeByteArrayL: Uint8Array;
    timeByteArrayR: Uint8Array;
  }

  interface ButterchurnVisualizer {
    loadPreset(preset: unknown, blendTime: number): void;
    render(frame: { audioLevels: ButterchurnAudioLevels }): void;
    setRendererSize(width: number, height: number): void;
  }

  const butterchurn: {
    createVisualizer(
      audioContext: AudioContext | null,
      canvas: HTMLCanvasElement,
      options: { width: number; height: number; pixelRatio: number },
    ): ButterchurnVisualizer;
  };

  export default butterchurn;
}

declare module 'butterchurn-presets' {
  const butterchurnPresets: {
    getPresets(): Record<string, unknown>;
  };

  export default butterchurnPresets;
}
