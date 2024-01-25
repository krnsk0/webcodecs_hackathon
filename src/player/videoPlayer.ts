import {
  OPTIMIZE_FOR_LATENCY_FLAG,
  REQUEST_HARDWARE_ACCELERATION,
} from './config';

interface BufferEntry {
  buffer: ImageBitmap;
  timestamp: number;
}

export class VideoPlayer {
  private decodedFrames: BufferEntry[] = [];
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
}
