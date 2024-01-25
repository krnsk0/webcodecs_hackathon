import { USE_BITMAP_RENDERER_CANVAS } from './config';
import { Demuxer } from './demuxer';
import { VideoPlayer } from './videoPlayer';

interface PlayerOptions {
  container: HTMLElement;
}

export interface AdPod {
  video: string;
}

export class Player {
  private canvasEl?: HTMLCanvasElement;
  private ctx?: RenderingContext;
  private adResponse: AdPod[] = [];
  private mp4BlobPromises: Promise<Blob>[] = [];
  private demuxer: Demuxer = new Demuxer();
  private videoPlayer?: VideoPlayer;
  private demuxReadyPromises: Promise<void>[] = [];
  private adVideoDecoderConfigs: VideoDecoderConfig[] = [];
  private adAudioDecoderConfigs: AudioDecoderConfig[] = [];
  private adEncodedAudioChunks: EncodedAudioChunk[][] = [];
  private adEncodedVideoChunks: EncodedVideoChunk[][] = [];
  private adPlaybackPromises: Promise<void>[] = [];
  private adPodIndex = -1;

  constructor(private options: PlayerOptions) {}

  reset() {
    this.options.container.innerHTML = '';
    this.canvasEl = undefined;
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
  }

  private log(...args: unknown[]) {
    console.log('[Player]', ...args);
  }

  private createCanvasElement() {
    const canvasEl = document.createElement('canvas');
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.width = 1600;
    canvasEl.height = 900;
    this.options.container.appendChild(canvasEl);
    this.canvasEl = canvasEl;
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
    videoDecoderConfig,
    adPodIndex,
  }: {
    videoDecoderConfig: VideoDecoderConfig;
    adPodIndex: number;
  }): Promise<void> {
    const encodedVideoChunks = this.adEncodedVideoChunks[adPodIndex];
    if (!encodedVideoChunks) throw new Error('no video chunks ready');
    this.log(`starting ad ${adPodIndex}`);
    this.videoPlayer = new VideoPlayer();
    await this.videoPlayer.setup({
      videoDecoderConfig,
      adPodIndex,
      encodedVideoChunks,
    });
  }

  private async startPlayingAds(): Promise<void> {
    for (let i = 0; i < this.adResponse.length; i += 1) {
      // wait for ad to fetch and then demux if it hasn't
      await this.demuxReadyPromises[i];

      // kick off playback
      this.adPodIndex = i;
      const adPlaybackPromise = this.startAd({
        videoDecoderConfig: this.adVideoDecoderConfigs[i],
        adPodIndex: i,
      });
      this.adPlaybackPromises.push(adPlaybackPromise);
      // TODO: catch/handle errors here; skip this ad?
      await adPlaybackPromise;
    }
  }

  async playAdResponse(adResponse: AdPod[]) {
    this.reset();
    this.adResponse = adResponse;
    this.createCanvasElement();
    this.startFetchingAds();
    this.startDemuxingAds();
    this.startPlayingAds();
  }

  visualizationData() {
    return {
      demuxedChunks: this.adEncodedVideoChunks[this.adPodIndex],
    };
  }
}
