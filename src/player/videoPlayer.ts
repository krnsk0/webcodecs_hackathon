import {
  OPTIMIZE_FOR_LATENCY_FLAG,
  REQUEST_HARDWARE_ACCELERATION,
} from './config';

interface BufferEntry {
  buffer: ImageBitmap;
  timestamp: number;
}

export class VideoPlayer {
  private bufferedFrames: BufferEntry[] = [];
  private adPodIndex?: number;
  private encodedVideoChunks: EncodedVideoChunk[] = [];
  private decoder?: VideoDecoder;

  async setup({
    videoDecoderConfig,
    adPodIndex,
    encodedVideoChunks,
  }: {
    videoDecoderConfig: VideoDecoderConfig;
    adPodIndex: number;
    encodedVideoChunks: EncodedVideoChunk[];
  }) {
    this.adPodIndex = adPodIndex;
    this.encodedVideoChunks = encodedVideoChunks;

    const decoderConfig: VideoDecoderConfig = {
      ...videoDecoderConfig,
      hardwareAcceleration: REQUEST_HARDWARE_ACCELERATION
        ? 'prefer-hardware'
        : 'no-preference',
      optimizeForLatency: OPTIMIZE_FOR_LATENCY_FLAG,
    };

    try {
      const { supported, config } =
        await VideoDecoder.isConfigSupported(decoderConfig);
      if (!supported) throw new Error('config not supported');
      this.decoder = new VideoDecoder({
        output: this.handleDecoderOutput.bind(this),
        error: this.handleDecoderErrors.bind(this),
      });

      this.decoder.configure(decoderConfig);
      this.log(`successfully configured decoder`, config);
    } catch (error: unknown) {
      this.log(`error configuring decoder`, error);
    }
  }

  private log(...args: unknown[]) {
    console.log('[Player]', ...args);
  }

  private handleDecoderErrors(error: unknown) {
    this.log('decoder error', error);
  }

  private async handleDecoderOutput(videoFrame: VideoFrame) {
    this.log('decoder output', videoFrame);
  }

  isDonePlaying() {
    if (!this.decoder) throw new Error('no decoder set up yet');
    return (
      this.encodedVideoChunks.length === 0 && this.bufferedFrames.length === 0
    );
  }

  async prebuffer() {
    this.log('prebuffering');
  }

  renderFrame({
    ctx,
    canvas,
    currentTimeMs,
  }: {
    ctx?: RenderingContext;
    canvas: HTMLCanvasElement;
    currentTimeMs: number;
  }) {
    if (!ctx) throw new Error('no context provided to renderFrame');
    this.log('renderFrame', currentTimeMs);

    if (ctx instanceof OffscreenCanvasRenderingContext2D) {
      ctx.transferFromImageBitmap(this.bufferedFrames[0].buffer);
    } else if (ctx instanceof CanvasRenderingContext2D) {
      ctx.drawImage(
        this.bufferedFrames[0].buffer,
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
  }
}
