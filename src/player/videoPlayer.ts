import {
  BUFFER_TARGET,
  OPTIMIZE_FOR_LATENCY_FLAG,
  PREBUFFER_TARGET,
  REQUEST_HARDWARE_ACCELERATION,
} from './config';
import { EncodedVideoChunkWithDts } from './demuxer';

interface BufferEntry {
  data: ImageBitmap;
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
  frameBuffer: BufferEntry[] = [];
  private highestBufferedCts: number = -Infinity;
  private frameDuration?: number;

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

    if (this.frameDuration === undefined) {
      this.frameDuration = videoFrame.duration ?? undefined;
    }

    const imageBitmap = await createImageBitmap(videoFrame);

    this.frameBuffer.push({
      data: imageBitmap,
      timestamp,
    });
  }

  isDonePlaying() {
    if (!this.decoder) throw new Error('no decoder set up yet');
    return (
      this.encodedVideoChunks.length === 0 && this.frameBuffer.length === 0
    );
  }

  private startDecodingUpToCts(targetCts: number) {
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
    let interval: ReturnType<typeof setTimeout>;
    const prebufferStartTime = Date.now();
    const promise = new Promise<void>((resolve, reject) => {
      this.prebufferPromiseResolver = resolve;
      this.log('prebuffering');
      this.startDecodingUpToCts(PREBUFFER_TARGET);

      // Sometimes pushing up to the target DTS isn't enough to get the decoder
      // to emit. So, after a little delay start yeeting in frames until we get
      // what we want
      interval = setInterval(() => {
        this.log('prebuffer did not complete; pushing more frames');
        if (this.frameDuration === undefined) throw new Error('no framerate');
        if (!this.prebufferingComplete) {
          this.startDecodingUpToCts(
            this.lastDtsPushedToDecoder + this.frameDuration
          );
        }
      }, 50);
    });
    promise.then(() => {
      this.prebufferingComplete = true;
      this.log(
        `prebuffering complete; took ${Date.now() - prebufferStartTime}ms`
      );
      clearInterval(interval);
    });
    return promise;
  }

  // purge frames more than 2 behind current time
  // we don't purge right after paint because compositing in the browser
  // is threaded, and if we purge before compoisiting is complete we risk
  // seeing a black screen as the frame's memory has been released at draw time
  private purgeFramesBeforeTime(currentTimeMs: number) {
    if (this.frameDuration === undefined)
      throw new Error('no framerate; did prebuffering complete?');
    const frameBuffer = this.frameBuffer;
    const cutoff = currentTimeMs - this.frameDuration * 2;
    while (frameBuffer.length > 0 && frameBuffer[0].timestamp < cutoff) {
      const bufferEntry = frameBuffer.shift();
      if (!bufferEntry) return;
      bufferEntry.data?.close();
    }
  }

  private findFrameForTime(currentTimeMs: number): BufferEntry | undefined {
    const frameDuration = this.frameDuration;
    if (frameDuration === undefined)
      throw new Error('no known frame duration; did prebuffering complete?');

    const bufferEntry = this.frameBuffer.find(
      (frame) =>
        frame.timestamp <= currentTimeMs &&
        frame.timestamp + frameDuration > currentTimeMs
    );
    return bufferEntry;
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

    const bufferEntry = this.findFrameForTime(currentTimeMs);
    this.log('renderFrame', bufferEntry);
    // TODO - log a dropped frame
    if (!bufferEntry) return;

    try {
      if (ctx instanceof ImageBitmapRenderingContext) {
        ctx.transferFromImageBitmap(bufferEntry.data);
      } else if (ctx instanceof CanvasRenderingContext2D) {
        ctx.drawImage(bufferEntry.data, 0, 0, canvas.width, canvas.height);
      }
    } catch (error: unknown) {
      this.log('error drawing to canvas', error);
    } finally {
      this.startDecodingUpToCts(currentTimeMs + BUFFER_TARGET);
      this.purgeFramesBeforeTime(currentTimeMs);
    }
  }
}
