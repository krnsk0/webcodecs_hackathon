import {
  OPTIMIZE_FOR_LATENCY_FLAG,
  PREBUFFER_TARGET,
  REQUEST_HARDWARE_ACCELERATION,
} from './config';
import { EncodedVideoChunkWithDts } from './demuxer';

interface BufferEntry {
  data: VideoFrame;
  timestamp: number;
}

export class VideoPlayer {
  timestampsBeingDecoded: number[] = [];
  timestampsBeingConverted: number[] = [];
  private adPodIndex?: number;
  private encodedVideoChunks: EncodedVideoChunkWithDts[] = [];
  private decoder?: VideoDecoder;
  private lastDtsPushedToDecoder: number = -Infinity;
  private prebufferPromiseResolver?: () => void;
  private prebufferingComplete = false;
  bufferedFrames: BufferEntry[] = [];
  private highestBufferedCts: number = -Infinity;

  async setup({
    videoDecoderConfig,
    adPodIndex,
    encodedVideoChunks,
  }: {
    videoDecoderConfig: VideoDecoderConfig;
    adPodIndex: number;
    encodedVideoChunks: EncodedVideoChunkWithDts[];
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
    console.log(`[VideoPlayer][ad ${this.adPodIndex}]`, ...args);
  }

  private handleDecoderErrors(error: unknown) {
    this.log('decoder error', error);
  }

  private removeTimestampFromDecodingChunksList(timestamp: number) {
    const index = this.timestampsBeingDecoded.indexOf(timestamp);
    if (index === -1) throw new Error('timestamp not found in decoding list');
    this.timestampsBeingDecoded.splice(index, 1);
  }

  private async handleDecoderOutput(videoFrame: VideoFrame) {
    if (!this.decoder) return;
    const timestamp = videoFrame.timestamp;
    this.log(`decoder output ${timestamp}`);
    this.removeTimestampFromDecodingChunksList(timestamp);
    this.highestBufferedCts = Math.max(this.highestBufferedCts, timestamp);
    if (!this.prebufferingComplete && timestamp >= PREBUFFER_TARGET) {
      this.prebufferPromiseResolver?.();
    }
    this.bufferedFrames.push({
      data: videoFrame,
      timestamp,
    });
  }

  isDonePlaying() {
    if (!this.decoder) throw new Error('no decoder set up yet');
    return (
      this.encodedVideoChunks.length === 0 && this.bufferedFrames.length === 0
    );
  }

  pushToDecoder(targetCts: number) {
    if (!this.decoder) throw new Error('no decoder set up yet');
    this.log(`attempting to push to decoder up to target cts ${targetCts}`);
    while (
      this.lastDtsPushedToDecoder < targetCts &&
      this.encodedVideoChunks.length > 0
    ) {
      const chunk = this.encodedVideoChunks.shift();
      if (!chunk) return;
      this.log(
        `pushing chunk w/ cts ${chunk.encodedVideoChunk.timestamp} and dts ${chunk.dts.toFixed(2)}`
      );
      this.lastDtsPushedToDecoder = chunk.dts;
      this.timestampsBeingDecoded.push(chunk.encodedVideoChunk.timestamp);
      this.decoder.decode(chunk.encodedVideoChunk);
    }
  }

  // aims to get us up to PREBUFFER_TARGET before starting playback
  async prebuffer() {
    let timeout: ReturnType<typeof setTimeout>;
    const prebufferStartTime = Date.now();
    const promise = new Promise<void>((resolve, reject) => {
      this.prebufferPromiseResolver = resolve;
      this.log('prebuffering');
      this.pushToDecoder(PREBUFFER_TARGET);
      timeout = setTimeout(() => {
        reject(new Error('prebuffering timed out'));
      }, 1000);
    });
    promise.then(() => {
      this.prebufferingComplete = true;
      this.log(
        `prebuffering complete; took ${Date.now() - prebufferStartTime}ms`
      );
      clearTimeout(timeout);
    });
    return promise;
  }

  renderFrame({
    ctx,
    canvas,
    currentTimeMs,
  }: {
    ctx?: RenderingContext;
    canvas?: HTMLCanvasElement;
    currentTimeMs: number;
  }) {
    if (!ctx) throw new Error('no context provided to renderFrame');
    if (!canvas) throw new Error('no canvas provided to renderFrame');
    // this.log('renderFrame', currentTimeMs);

    // if (ctx instanceof ImageBitmapRenderingContext) {
    //   ctx.transferFromImageBitmap(this.bufferedFrames[0].buffer);
    // } else if (ctx instanceof CanvasRenderingContext2D) {
    //   ctx.drawImage(
    //     this.bufferedFrames[0].buffer,
    //     0,
    //     0,
    //     canvas.width,
    //     canvas.height
    //   );
    // }
  }
}
