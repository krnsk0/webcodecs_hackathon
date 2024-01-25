const ASSUMED_CHANNELS_FOR_NOW = 2;
const ASSUMED_SAMPLE_RATE_FOR_NOW = 48_000;

export class AudioPlayer {
  private audioDecoder?: AudioDecoder;
  private audioFrames: AudioData[] = [];
  private audioContext?: AudioContext;
  private audioBuffer?: AudioBuffer;
  private audioSource?: AudioBufferSourceNode;
  private bufferedBytes = 0;
  private encodedAudioChunks?: EncodedAudioChunk[];
  private log = console.log.bind(this, '[AudioPlayer]');

  private settingUp?: Promise<void>;

  public async setup({
    audioDecoderConfig,
    encodedAudioChunks,
  }: {
    audioDecoderConfig: AudioDecoderConfig;
    encodedAudioChunks: EncodedAudioChunk[];
  }) {
    if (!this.settingUp) {
      this.settingUp = this._setup(audioDecoderConfig, encodedAudioChunks);
    }
    return this.settingUp;
  }

  private async _setup(
    audioDecoderConfig: AudioDecoderConfig,
    encodedAudioChunks: EncodedAudioChunk[]
  ): Promise<void> {
    try {
      this.encodedAudioChunks = encodedAudioChunks;
      const { supported, config } =
        await AudioDecoder.isConfigSupported(audioDecoderConfig);
      if (!supported) throw new Error('audio config not supported');
      this.audioDecoder = new AudioDecoder({
        output: this.handleAudioDecoderOutput.bind(this),
        error: this.handleAudioDecoderErrors.bind(this),
      });
      this.audioDecoder.configure(config);
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
    return this.audioContext?.getOutputTimestamp().contextTime ?? 0;
  }

  private handleAudioDecoderOutput(audioFrame: AudioData) {
    this.audioFrames.push(audioFrame);
  }

  private handleAudioDecoderErrors(error: unknown) {
    this.log('audio decoder error', error);
    this.stop();
  }

  public async prebuffer() {
    if (
      this.encodedAudioChunks === undefined ||
      this.audioDecoder === undefined
    ) {
      throw new Error('call to setup before prebuffer for audioPlayer');
    }
    for (const encodedAudioChunk of this.encodedAudioChunks) {
      this.audioDecoder.decode(encodedAudioChunk);
    }
    await this.audioDecoder.flush();
    this.audioBuffer = new AudioBuffer({
      numberOfChannels: ASSUMED_CHANNELS_FOR_NOW,
      length: this.audioFrames.length * ASSUMED_SAMPLE_RATE_FOR_NOW,
      sampleRate: ASSUMED_SAMPLE_RATE_FOR_NOW,
    });
    const start = Date.now();
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
      this.bufferedBytes += offset;
    }
    this.log('buffered audio in ' + (Date.now() - start));
    this.audioContext = new AudioContext({
      sampleRate: ASSUMED_SAMPLE_RATE_FOR_NOW,
      latencyHint: 'interactive',
    });
    this.audioSource = this.audioContext.createBufferSource();
    this.audioSource.buffer = this.audioBuffer;
    this.audioSource.connect(this.audioContext.destination);
    this.audioSource.start();
  }

  private stopping?: Promise<void>;

  public async stop(): Promise<void> {
    this.settingUp = undefined;
    if (this.audioDecoder) {
      this.audioDecoder.close();
      this.audioDecoder = undefined;
    }
    if (this.audioContext) {
      this.stopping = this.audioContext.close();
      this.audioContext = undefined;
      await this.stopping;
      this.stopping = undefined;
    }
    await this.stopping;
  }

  public getBufferSizeBytes() {
    return this.bufferedBytes;
  }
}
