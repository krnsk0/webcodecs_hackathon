const ASSUMED_CHANNELS_FOR_NOW = 2;
const ASSUMED_SAMPLE_RATE_FOR_NOW = 48_000;

export class AudioPlayer {
  private audioDecoder?: AudioDecoder;

  private audioFrames: AudioData[] = [];

  private audioContext = new AudioContext({
    sampleRate: ASSUMED_SAMPLE_RATE_FOR_NOW,
    latencyHint: 'playback',
  });

  private audioBuffer?: AudioBuffer;
  private audioSource?: AudioBufferSourceNode;

  private log = console.log;

  public async setup({
    audioDecoderConfig,
    encodedAudioChunks,
  }: {
    audioDecoderConfig: AudioDecoderConfig;
    encodedAudioChunks: EncodedAudioChunk[];
  }) {
    try {
      const { supported, config } =
        await AudioDecoder.isConfigSupported(audioDecoderConfig);
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
  }

  public getCurrentTime(): number {
    return this.audioContext.getOutputTimestamp().contextTime ?? 0;
  }

  private handleAudioDecoderOutput(audioFrame: AudioData) {
    this.audioFrames.push(audioFrame);
  }

  private handleAudioDecoderErrors(error: unknown) {
    this.log('audio decoder error', error);
  }

  // aims to get us up to PREBUFFER_TARGET before starting playback
  public prebuffer() {
    // nothing to do yet!
  }

  public stop(): Promise<void> {
    return this.audioContext.close();
  }

  public getBufferSizeBytes() {
    // TODO
    return 0;
  }
}
