import { USE_BITMAP_RENDERER_CANVAS } from './config';
import { Demuxer, EncodedVideoChunkWithDts } from './demuxer';
import { AudioPlayer } from './audioPlayer';
import { VideoPlayer } from './videoPlayer';

interface PlayerOptions {
  container: HTMLElement;
}

export interface AdPod {
  video: string;
}

export class Player {
  private canvas?: HTMLCanvasElement;
  private ctx?: RenderingContext;
  private adResponse: AdPod[] = [];
  private mp4BlobPromises: Promise<Blob>[] = [];
  private demuxer: Demuxer = new Demuxer();
  private audioPlayer?: AudioPlayer;
  private videoPlayer?: VideoPlayer;
  private demuxReadyPromises: Promise<void>[] = [];
  private adVideoDecoderConfigs: VideoDecoderConfig[] = [];
  private adAudioDecoderConfigs: AudioDecoderConfig[] = [];
  private adEncodedAudioChunks: EncodedAudioChunk[][] = [];
  private adEncodedVideoChunks: EncodedVideoChunkWithDts[][] = [];
  private adPlaybackPromises: Promise<void>[] = [];
  private adPodIndex = -1;
  private currentAdStartTime?: number;
  private animationFrameCallbackCount = 0;

  constructor(private options: PlayerOptions) {}

  reset() {
    this.options.container.innerHTML = '';
    this.canvas = undefined;
    this.ctx = undefined;
    this.adResponse = [];
    this.mp4BlobPromises = [];
    this.demuxer = new Demuxer();
    this.demuxReadyPromises = [];
    this.adVideoDecoderConfigs = [];
    this.adAudioDecoderConfigs = [];
    this.adEncodedAudioChunks = [];
    this.adEncodedVideoChunks = [];
    this.adPlaybackPromises = [];
    this.adPodIndex = 0;
    this.currentAdStartTime = undefined;
  }

  private log(...args: unknown[]) {
    console.log('[Player]', ...args);
  }

  private createCanvasElement() {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = 1600;
    canvasEl.height = 900;
    this.options.container.appendChild(canvasEl);
    this.canvas = canvasEl;
    const ctx = canvasEl.getContext(
      USE_BITMAP_RENDERER_CANVAS ? 'bitmaprenderer' : '2d'
    );
    if (!ctx) throw new Error('could not create context');
    this.ctx = ctx;
  }

  private async fetchAd(adPodIndex: number): Promise<Blob> {
    this.log(`fetching ad ${adPodIndex} at ${Date.now()}`);
    const response = await fetch(this.adResponse[adPodIndex].video);
    return await response.blob();
  }

  /**
   * Ads are fetched one at a time, but can be fetched while other ads are
   * demuxing or playing
   */
  private async startFetchingAds(): Promise<void> {
    for (let i = 0; i < this.adResponse.length; i += 1) {
      const mp4BlobPromise = this.fetchAd(i);
      this.mp4BlobPromises.push(mp4BlobPromise);
      // TODO: catch/handle errors here; skip this ad?
      await mp4BlobPromise;
      this.log(`done fetching ${i} at ${Date.now()}`);
    }
  }

  private async demuxAd(
    mp4BlobPromise: Promise<Blob>,
    adPodIndex: number
  ): Promise<void> {
    // wait for it to fetch if it hasn't
    const mp4Blob = await mp4BlobPromise;

    // push throgh demuxer
    // TODO: in future can probably wait just for the videoInfo and N number of
    // samples to be ready rather than waiting for completion of the whole thing
    await this.demuxer.demuxMp4Blob({
      mp4Blob,
      onVideoDecoderConfigReady: (config) => {
        this.adVideoDecoderConfigs[adPodIndex] = config;
        this.log(
          `video decoder config ready for ad ${adPodIndex} at ${Date.now()}`
        );
      },
      onAudioDecoderConfigReady: (config) => {
        this.adAudioDecoderConfigs[adPodIndex] = config;
        this.log(
          `audio decoder config ready for ad ${adPodIndex} at ${Date.now()}`
        );
      },
      onVideoChunk: (chunk) => {
        if (!this.adEncodedVideoChunks[adPodIndex])
          this.adEncodedVideoChunks[adPodIndex] = [chunk];
        else this.adEncodedVideoChunks[adPodIndex].push(chunk);
      },
      onAudioChunk: (chunk) => {
        if (!this.adEncodedAudioChunks[adPodIndex])
          this.adEncodedAudioChunks[adPodIndex] = [chunk];
        else this.adEncodedAudioChunks[adPodIndex].push(chunk);
      },
    });
  }

  /**
   * Ads are demuxed one at a time, but can be demuxed while other ads are
   * fetching or playing
   */
  private async startDemuxingAds(): Promise<void> {
    for (
      let adPodIndex = 0;
      adPodIndex < this.adResponse.length;
      adPodIndex += 1
    ) {
      const demuxReadyPromise = this.demuxAd(
        this.mp4BlobPromises[adPodIndex],
        adPodIndex
      );
      this.demuxReadyPromises.push(demuxReadyPromise);
      // TODO: catch/handle errors here; skip this ad?
      await demuxReadyPromise;
      this.log(`finished demuxing ad ${adPodIndex} at ${Date.now()}`);
    }
  }

  private async startAd({
    audioDecoderConfig,
    videoDecoderConfig,
    adPodIndex,
  }: {
    audioDecoderConfig: AudioDecoderConfig;
    videoDecoderConfig: VideoDecoderConfig;
    adPodIndex: number;
  }): Promise<void> {
    const encodedAudioChunks = this.adEncodedAudioChunks[adPodIndex];
    if (!encodedAudioChunks) throw new Error('no audio chunks ready');
    const encodedVideoChunks = this.adEncodedVideoChunks[adPodIndex];
    if (!encodedVideoChunks) throw new Error('no video chunks ready');
    this.log(`starting ad ${adPodIndex}`);
    this.audioPlayer = new AudioPlayer();
    this.videoPlayer = new VideoPlayer();

    await Promise.all([
      this.audioPlayer.setup({
        audioDecoderConfig,
        encodedAudioChunks,
      }),
      this.videoPlayer.setup({
        videoDecoderConfig,
        adPodIndex,
        encodedVideoChunks,
      }),
    ]);

    await Promise.all([
      this.audioPlayer.prebuffer(),
      this.videoPlayer.prebuffer(),
    ]);

    // START PLAYBACK
    this.currentAdStartTime = Date.now();
    this.animationFrameCallbackCount = 0;
    return new Promise((resolve) => {
      const animationFrameCallback = async () => {
        if (!this.currentAdStartTime)
          throw new Error('no current ad start time');
        if (!this.videoPlayer) return;
        this.animationFrameCallbackCount += 1;
        const currentTimeMs =
          this.audioPlayer === undefined
            ? Date.now() - this.currentAdStartTime
            : 1_000 * this.audioPlayer.getCurrentTime();

        this.videoPlayer.renderFrame({
          ctx: this.ctx,
          canvas: this.canvas,
          currentTimeMs,
        });

        if (this.videoPlayer.isDonePlaying()) {
          this.log(`done playing ad ${adPodIndex}`);
          await this.audioPlayer?.stop();
          resolve();
        } else requestAnimationFrame(animationFrameCallback);
      };
      requestAnimationFrame(animationFrameCallback);
    });
  }

  private async startPlayingAds(): Promise<void> {
    for (let i = 0; i < this.adResponse.length; i += 1) {
      // wait for ad to fetch and then demux if it hasn't
      await this.demuxReadyPromises[i];

      // kick off playback
      this.adPodIndex = i;
      const adPlaybackPromise = this.startAd({
        audioDecoderConfig: this.adAudioDecoderConfigs[i],
        videoDecoderConfig: this.adVideoDecoderConfigs[i],
        adPodIndex: i,
      });
      this.adPlaybackPromises.push(adPlaybackPromise);
      // TODO: catch/handle errors here; skip this ad?
      await adPlaybackPromise;
    }
  }

  public async playAdResponse(adResponse: AdPod[]) {
    this.reset();
    this.adResponse = adResponse;
    this.createCanvasElement();
    this.startFetchingAds();
    this.startDemuxingAds();
    this.startPlayingAds();
  }

  public visualizationData() {
    return {
      demuxedChunks: this.adEncodedVideoChunks[this.adPodIndex],
      decodingChunks: this.videoPlayer?.timestampsBeingDecoded,
      convertingFrames: this.videoPlayer?.timestampsBeingConverted,
      bufferedFrames: this.videoPlayer?.frameBuffer,
    };
  }

  private getAnimationFramerate() {
    if (!this.currentAdStartTime) return 0;
    return (
      (this.animationFrameCallbackCount /
        (Date.now() - this.currentAdStartTime)) *
      1000
    );
  }

  public getMetrics() {
    return {
      url: this.adResponse[this.adPodIndex]?.video || '',
      sourceWidth: this.adVideoDecoderConfigs[this.adPodIndex]?.codedWidth || 0,
      sourceHeight:
        this.adVideoDecoderConfigs[this.adPodIndex]?.codedHeight || 0,
      sourceFramerate: this.videoPlayer?.getSourceFramerate() || 0,
      sourceCodec: this.adVideoDecoderConfigs[this.adPodIndex]?.codec || '',
      animationFramerate: this.getAnimationFramerate(),
      playbackFramerate: this.videoPlayer?.getPlaybackFramerate() || 0,
      conversionFramerate: this.videoPlayer?.getConversionFramerate() || 0,
      decodeFramerate: this.videoPlayer?.getDecodeFramerate() || 0,
      droppedFrames: this.videoPlayer?.droppedFrameCount,
      bufferedTime: this.videoPlayer?.getBufferedTimeSec() || 0,
      videoBufferSizeBytes: this.videoPlayer?.getBufferSizeBytes() || 0,
      audioBufferSourceSize: this.audioPlayer?.getBufferSizeBytes() || 0,
    };
  }
}
