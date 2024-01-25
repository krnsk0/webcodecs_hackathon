import {
  OPTIMIZE_FOR_LATENCY_FLAG,
  REQUEST_HARDWARE_ACCELERATION,
} from './config';

interface BufferEntry {
  buffer: ImageBitmap;
  timestamp: number;
}

export class VideoPlayer {
  timestampsBeingDecoded: number[] = [];
  timestampsBeingConverted: number[] = [];
  bufferedFrames: BufferEntry[] = [];
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

  private removeTimestampFromDecodingChunksList(timestamp: number) {
    const index = this.timestampsBeingDecoded.indexOf(timestamp);
    if (index === -1) throw new Error('timestamp not found in decoding list');
    this.timestampsBeingDecoded.splice(index, 1);
  }

  private async handleDecoderOutput(videoFrame: VideoFrame) {
    this.log('decoder output', videoFrame);
    this.removeTimestampFromDecodingChunksList(videoFrame.timestamp);
  }

  isDonePlaying() {
    if (!this.decoder) throw new Error('no decoder set up yet');
    return (
      this.encodedVideoChunks.length === 0 && this.bufferedFrames.length === 0
    );
  }

  pushToDecoder(targetTimestamp: number) {
    if (!this.decoder) throw new Error('no decoder set up yet');
    const chunk = this.encodedVideoChunks.shift();
    console.log('chunk: ', chunk);
    if (!chunk) return;

    this.timestampsBeingDecoded.push(chunk.timestamp);
    this.decoder.decode(chunk);
  }

  // get at least first frame
  async prebuffer() {
    this.log('prebuffering');
    const firstFrameTimestamp = this.encodedVideoChunks[0].timestamp;
    this.pushToDecoder(firstFrameTimestamp);
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
