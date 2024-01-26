import {
  BUFFER_TARGET,
  FRAME_CONVERSION_WORKERS,
  FRAME_PURGE_THRESHOLD,
  OPTIMIZE_FOR_LATENCY_FLAG,
  PREBUFFER_TARGET,
  REQUEST_HARDWARE_ACCELERATION,
} from './config';
import { EncodedVideoChunkWithDts } from './demuxer';
import { WorkDelegator } from './workDelegator';

const NOISY_LOGS = false;

export interface BufferEntry {
  bitmap: ImageBitmap;
  timestamp: number;
}

const workDelegator = new WorkDelegator(
  FRAME_CONVERSION_WORKERS,
  new URL('./worker.js', import.meta.url)
);

export class VideoPlayer {
  public timestampsBeingDecoded: number[] = [];
  public timestampsBeingConverted: number[] = [];
  private encodedVideoChunks: EncodedVideoChunkWithDts[] = [];
  private lastDtsPushedToDecoder: number = -Infinity;
  private timestampOffset?: number;
  private prebufferPromiseResolver?: () => void;
  private prebufferingComplete = false;
  public frameBuffer: BufferEntry[] = [];
  private highestBufferedCts: number = -Infinity;
  private frameDuration?: number;
  private hasDecoderFlushed = false;
  private hasDecoderFlushStarted = false;
  private videoDecoder?: VideoDecoder;
  private lastDrawnFrameTimstamp?: number;
  private framesSuccessullyRendered = 0;
  private firstFrameDisplayTimestamp?: number;
  private framesConverted = 0;
  private firstFrameConversionTimestamp?: number;
  private framesDecoded = 0;
  private firstFrameDecodedTimestamp?: number;
  public droppedFrameCount = 0;
  private settingUp?: Promise<void>;

  public async setup({
    videoDecoderConfig,
    encodedVideoChunks,
  }: {
    videoDecoderConfig: VideoDecoderConfig;
    encodedVideoChunks: EncodedVideoChunkWithDts[];
  }) {
    if (!this.settingUp) {
      this.settingUp = this._setup(videoDecoderConfig, encodedVideoChunks);
    }
    return this.settingUp;
  }

  private async _setup(
    videoDecoderConfig: VideoDecoderConfig,
    encodedVideoChunks: EncodedVideoChunkWithDts[]
  ) {
    this.encodedVideoChunks = encodedVideoChunks;

    workDelegator.onMessageFromAnyWorker((event) => {
      // TODO: fix implicit any here
      this.onFinishedConvertingFrame(event.data);
    });

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
      if (!supported) throw new Error('video config not supported');
      this.videoDecoder = new VideoDecoder({
        output: this.handleDecoderOutput.bind(this),
        error: this.handleDecoderErrors.bind(this),
      });

      this.videoDecoder.configure(decoderConfig);
      this.log(`successfully configured video decoder`, config);
    } catch (error: unknown) {
      this.log(`error configuring video decoder`, error);
    }
  }

  private log(...args: unknown[]) {
    console.log(`[VideoPlayer]`, ...args);
  }

  private handleDecoderErrors(error: unknown) {
    this.log('decoder error', error);
  }

  private removeTimestampFromDecodingChunksList(timestamp: number) {
    const index = this.timestampsBeingDecoded.indexOf(timestamp);
    if (index === -1) throw new Error('timestamp not found in decoding list');
    this.timestampsBeingDecoded.splice(index, 1);
  }

  private removeTimestampFromConvertingChunksList(timestamp: number) {
    const index = this.timestampsBeingConverted.indexOf(timestamp);
    if (index === -1) throw new Error('timestamp not found in converting list');
    this.timestampsBeingConverted.splice(index, 1);
  }

  private async handleDecoderOutput(videoFrame: VideoFrame) {
    if (!this.videoDecoder) return;
    const timestamp = videoFrame.timestamp;
    if (NOISY_LOGS) this.log(`decoder output ${timestamp}`);

    if (this.timestampOffset === undefined) {
      this.timestampOffset = videoFrame.timestamp;
    }

    this.removeTimestampFromDecodingChunksList(timestamp);

    this.highestBufferedCts = Math.max(this.highestBufferedCts, timestamp);

    if (!this.prebufferingComplete && timestamp >= PREBUFFER_TARGET) {
      this.prebufferPromiseResolver?.();
    }

    if (this.frameDuration === undefined) {
      this.frameDuration = videoFrame.duration ?? undefined;
    }

    if (this.firstFrameDecodedTimestamp === undefined) {
      this.firstFrameDecodedTimestamp = Date.now();
    }

    this.framesDecoded += 1;

    this.startConvertingFrame({ videoFrame, timestamp });
  }

  isDonePlaying() {
    if (!this.videoDecoder) false;
    return (
      this.encodedVideoChunks.length === 0 &&
      this.frameBuffer.length === 0 &&
      this.hasDecoderFlushed
    );
  }

  private startDecodingUpToCts(targetCts: number) {
    if (!this.videoDecoder) throw new Error('no decoder set up yet');
    if (NOISY_LOGS)
      this.log(`attempting to push to decoder up to target cts ${targetCts}`);
    if (this.encodedVideoChunks.length === 0 && !this.hasDecoderFlushStarted) {
      this.hasDecoderFlushStarted = true;
      const decoderFlushStartTime = Date.now();
      this.log(`no more chunks to push; flushing decoder`);
      this.videoDecoder.flush().then(() => {
        this.log(
          `decoder flush complete; took ${Date.now() - decoderFlushStartTime}ms`
        );
        this.hasDecoderFlushed = true;
      });
    }

    while (
      this.lastDtsPushedToDecoder < targetCts &&
      this.encodedVideoChunks.length > 0
    ) {
      const chunk = this.encodedVideoChunks.shift();
      if (!chunk) return;
      if (NOISY_LOGS)
        this.log(
          `pushing chunk w/ cts ${chunk.encodedVideoChunk.timestamp} and dts ${chunk.dts.toFixed(2)}`
        );
      this.lastDtsPushedToDecoder = chunk.dts;
      this.timestampsBeingDecoded.push(chunk.encodedVideoChunk.timestamp);
      this.videoDecoder.decode(chunk.encodedVideoChunk);
    }
  }

  // aims to get us up to PREBUFFER_TARGET before starting playback
  public async prebuffer() {
    let interval: ReturnType<typeof setTimeout>;
    const prebufferStartTime = Date.now();
    const promise = new Promise<void>((resolve) => {
      this.prebufferPromiseResolver = resolve;
      this.log('prebuffering');
      this.startDecodingUpToCts(PREBUFFER_TARGET);

      // Sometimes pushing up to the target DTS isn't enough to get the decoder
      // to emit. So, after a little delay start yeeting in frames until we get
      // what we want
      interval = setInterval(() => {
        this.log('prebuffer did not complete; pushing more frames');
        let advanceBy = 33.3333;
        if (this.frameDuration !== undefined) {
          advanceBy = this.frameDuration;
        }
        if (!this.prebufferingComplete) {
          this.startDecodingUpToCts(this.lastDtsPushedToDecoder + advanceBy);
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

  private startConvertingFrame({
    videoFrame,
    timestamp,
  }: {
    videoFrame: VideoFrame;
    timestamp: number;
  }) {
    if (NOISY_LOGS) this.log(`starting conversion of frame ${timestamp}`);
    this.timestampsBeingConverted.push(timestamp);
    workDelegator.postMessageToNextWorker(
      {
        videoFrame,
        timestamp,
      },
      [videoFrame]
    );
  }

  private onFinishedConvertingFrame({
    timestamp,
    bitmap,
  }: {
    timestamp: number;
    bitmap: ImageBitmap;
  }) {
    if (NOISY_LOGS) this.log(`finished conversion of frame ${timestamp}`);
    this.removeTimestampFromConvertingChunksList(timestamp);
    if (this.firstFrameConversionTimestamp === undefined) {
      this.firstFrameConversionTimestamp = Date.now();
    }
    this.framesConverted += 1;
    this.frameBuffer.push({
      bitmap,
      timestamp,
    });
  }

  // purge frames more than FRAME_PURGE_THRESHOLD behind current time
  // we don't purge right after paint because compositing in the browser
  // is threaded, and if we purge before compoisiting is complete we risk
  // seeing a black screen as the frame's memory has been released at draw time
  private purgeFramesBeforeTime(currentTimeMs: number) {
    if (this.frameDuration === undefined)
      throw new Error('no framerate; did prebuffering complete?');
    const frameBuffer = this.frameBuffer;
    const cutoff = currentTimeMs - this.frameDuration * FRAME_PURGE_THRESHOLD;
    while (frameBuffer.length > 0 && frameBuffer[0].timestamp < cutoff) {
      const bufferEntry = frameBuffer.shift();
      if (!bufferEntry) return;
    }
  }

  private findFrameForTime(currentTimeMs: number): BufferEntry | undefined {
    const frameDuration = this.frameDuration;
    const timestampOffset = this.timestampOffset;
    if (frameDuration === undefined)
      throw new Error('no known frame duration; did prebuffering complete?');
    if (timestampOffset === undefined)
      throw new Error('no known timestamp offset; did prebuffering complete?');
    const bufferEntry = this.frameBuffer.find((frame) => {
      const frameStart = frame.timestamp - timestampOffset;
      const roundedCurrentTime = Math.floor(currentTimeMs);
      // we don't have to care about the upper bound because frames
      // are ordered
      return frameStart <= roundedCurrentTime;
    });
    return bufferEntry;
  }

  public renderFrame({
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

    this.startDecodingUpToCts(currentTimeMs + BUFFER_TARGET);
    this.purgeFramesBeforeTime(currentTimeMs);
    const bufferEntry = this.findFrameForTime(currentTimeMs);
    if (NOISY_LOGS)
      this.log(`attempting frame render at time ${currentTimeMs}`);

    if (!bufferEntry) {
      this.log(`dropped frame at time ${currentTimeMs}`);
      this.droppedFrameCount += 1;
      return;
    }

    // don't draw the same frame twice
    if (bufferEntry.timestamp === this.lastDrawnFrameTimstamp) return;

    try {
      if (ctx instanceof ImageBitmapRenderingContext) {
        ctx.transferFromImageBitmap(bufferEntry.bitmap);
      } else if (ctx instanceof CanvasRenderingContext2D) {
        ctx.drawImage(bufferEntry.bitmap, 0, 0, canvas.width, canvas.height);
      }
    } catch (error: unknown) {
      this.log('error drawing to canvas', error);
    } finally {
      if (this.firstFrameDisplayTimestamp === undefined) {
        this.firstFrameDisplayTimestamp = Date.now();
      }
      this.framesSuccessullyRendered += 1;
      this.lastDrawnFrameTimstamp = bufferEntry.timestamp;
    }
  }

  public getSourceFramerate(): number {
    if (this.isDonePlaying()) return 0;
    if (this.frameDuration === undefined) return 0;
    return 1000 / this.frameDuration;
  }

  public getPlaybackFramerate(): number {
    if (this.isDonePlaying()) return 0;
    if (this.firstFrameDisplayTimestamp === undefined) return 0;
    return (
      this.framesSuccessullyRendered /
      ((Date.now() - this.firstFrameDisplayTimestamp) / 1000)
    );
  }

  public getConversionFramerate(): number {
    if (this.isDonePlaying()) return 0;
    if (this.firstFrameConversionTimestamp === undefined) return 0;
    return (
      this.framesConverted /
      ((Date.now() - this.firstFrameConversionTimestamp) / 1000)
    );
  }

  public getDecodeFramerate(): number {
    if (this.isDonePlaying()) return 0;
    if (this.firstFrameDecodedTimestamp === undefined) return 0;
    return (
      this.framesDecoded /
      ((Date.now() - this.firstFrameDecodedTimestamp) / 1000)
    );
  }

  public getBufferedTimeSec(): number {
    if (this.isDonePlaying()) return 0;
    if (this.highestBufferedCts === -Infinity) return 0;
    if (this.lastDrawnFrameTimstamp === undefined) return 0;
    return (this.highestBufferedCts - this.lastDrawnFrameTimstamp) / 1_000;
  }

  public getBufferSizeBytes(): number {
    if (this.isDonePlaying()) return 0;
    return this.encodedVideoChunks.reduce(
      (acc, chunk) => acc + chunk.encodedVideoChunk.byteLength,
      0
    );
  }
}
