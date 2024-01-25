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

const ASSUMED_CHANNELS_FOR_NOW = 2;
const ASSUMED_SAMPLE_RATE_FOR_NOW = 48_000;
const ASSUMED_CODEC_FOR_NOW = 'mp4a.40.2';

export class VideoPlayer {
  timestampsBeingDecoded: number[] = [];
  timestampsBeingConverted: number[] = [];
  private adPodIndex?: number;
  private encodedVideoChunks: EncodedVideoChunkWithDts[] = [];
  private lastDtsPushedToDecoder: number = -Infinity;
  private prebufferPromiseResolver?: () => void;
  private prebufferingComplete = false;
  frameBuffer: BufferEntry[] = [];
  private highestBufferedCts: number = -Infinity;
  private frameDuration?: number;
  private hasDecoderFlushed = false;
  private hasDecoderFlushStarted = false;

  private audioDecoder?: AudioDecoder;
  private videoDecoder?: VideoDecoder;

  private audioFrames: AudioData[] = [];

  private audioContext = new AudioContext({
    sampleRate: ASSUMED_SAMPLE_RATE_FOR_NOW,
    latencyHint: 'playback',
  });

  private audioBuffer?: AudioBuffer;
  private audioSource?: AudioBufferSourceNode;

  async setup({
    videoDecoderConfig,
    adPodIndex,
    encodedVideoChunks,
    encodedAudioChunks,
  }: {
    videoDecoderConfig: VideoDecoderConfig;
    adPodIndex: number;
    encodedVideoChunks: EncodedVideoChunkWithDts[];
    encodedAudioChunks: EncodedAudioChunk[];
  }) {
    this.adPodIndex = adPodIndex;
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
      const { supported, config } = await AudioDecoder.isConfigSupported({
        codec: ASSUMED_CODEC_FOR_NOW,
        sampleRate: ASSUMED_SAMPLE_RATE_FOR_NOW,
        numberOfChannels: ASSUMED_CHANNELS_FOR_NOW,
      });
      if (!supported) throw new Error('audio config not supported');
      this.audioDecoder = new AudioDecoder({
        output: this.handleAudioDecoderOutput.bind(this),
        error: this.handleAudioDecoderErrors.bind(this),
      });
      this.audioDecoder.configure(config);

      for (let i = 0; i < encodedAudioChunks.length; i++) {
        this.audioDecoder.decode(encodedAudioChunks[i]);
      }
      await this.audioDecoder.flush();
      this.audioBuffer = new AudioBuffer({
        numberOfChannels: ASSUMED_CHANNELS_FOR_NOW,
        length: this.audioFrames.length * ASSUMED_SAMPLE_RATE_FOR_NOW,
        sampleRate: ASSUMED_SAMPLE_RATE_FOR_NOW,
      });
      for (
        let channel = 0;
        channel < this.audioFrames[0].numberOfChannels;
        channel++
      ) {
        const options = {
          format: this.audioFrames[0].format,
          planeIndex: channel,
        };
        const destination = this.audioBuffer.getChannelData(channel);
        let offset = 0;
        for (const frame of this.audioFrames) {
          const size =
            frame.allocationSize(options) / Float32Array.BYTES_PER_ELEMENT;
          frame.copyTo(destination.subarray(offset, offset + size), options);
          offset += size;
        }
      }
      this.audioSource = this.audioContext.createBufferSource();
      this.audioSource.buffer = this.audioBuffer;
      this.audioSource.connect(this.audioContext.destination);
      this.audioSource.start();
      this.log(
        'successfully configured audio decoder and have ' +
          this.audioFrames.length +
          ' frames',
        config
      );
    } catch (error: unknown) {
      this.log('error configuring audio decoder', error);
    }

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

  private removeTimestampFromConvertingChunksList(timestamp: number) {
    const index = this.timestampsBeingConverted.indexOf(timestamp);
    if (index === -1) throw new Error('timestamp not found in converting list');
    this.timestampsBeingConverted.splice(index, 1);
  }

  private handleAudioDecoderOutput(audioFrame: AudioData) {
    this.audioFrames.push(audioFrame);
  }

  private handleAudioDecoderErrors(error: unknown) {
    this.log('audio decoder error', error);
  }

  private async handleDecoderOutput(videoFrame: VideoFrame) {
    if (!this.videoDecoder) return;
    const timestamp = videoFrame.timestamp;
    if (NOISY_LOGS) this.log(`decoder output ${timestamp}`);

    this.removeTimestampFromDecodingChunksList(timestamp);

    this.highestBufferedCts = Math.max(this.highestBufferedCts, timestamp);

    if (!this.prebufferingComplete && timestamp >= PREBUFFER_TARGET) {
      this.prebufferPromiseResolver?.();
    }

    if (this.frameDuration === undefined) {
      this.frameDuration = videoFrame.duration ?? undefined;
    }

    this.startConvertingFrame({ videoFrame, timestamp });
  }

  isDonePlaying() {
    if (!this.videoDecoder) throw new Error('no decoder set up yet');
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
      this.log(`no more chunks to push; attempting flush`);
      this.videoDecoder.flush().then(() => {
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
  async prebuffer() {
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

    this.startDecodingUpToCts(currentTimeMs + BUFFER_TARGET);
    this.purgeFramesBeforeTime(currentTimeMs);
    const bufferEntry = this.findFrameForTime(currentTimeMs);
    if (NOISY_LOGS)
      this.log(`attempting frame render at time ${currentTimeMs}`);

    if (!bufferEntry) {
      this.log(`dropped frame at time ${currentTimeMs}`);
      return;
    }

    try {
      if (ctx instanceof ImageBitmapRenderingContext) {
        ctx.transferFromImageBitmap(bufferEntry.bitmap);
      } else if (ctx instanceof CanvasRenderingContext2D) {
        ctx.drawImage(bufferEntry.bitmap, 0, 0, canvas.width, canvas.height);
      }
    } catch (error: unknown) {
      this.log('error drawing to canvas', error);
    }
  }
}
