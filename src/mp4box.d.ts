/**
 * From {@link https://github.com/kixelated/moq-js/blob/9a8053db72eaabe77d6d325a7de9375c6c0d4719/types/mp4box.d.ts}
 */

declare module 'mp4box' {
  interface MP4MediaTrack {
    id: number;
    created: Date;
    modified: Date;
    movie_duration: number;
    layer: number;
    alternate_group: number;
    volume: number;
    track_width: number;
    track_height: number;
    timescale: number;
    duration: number;
    bitrate: number;
    codec: string;
    language: string;
    nb_samples: number;
  }

  interface MP4VideoData {
    width: number;
    height: number;
  }

  export interface MP4VideoTrack extends MP4MediaTrack {
    video: MP4VideoData;
  }

  interface MP4AudioData {
    sample_rate: number;
    channel_count: number;
    sample_size: number;
  }

  export interface MP4AudioTrack extends MP4MediaTrack {
    audio: MP4AudioData;
  }

  type MP4Track = MP4VideoTrack | MP4AudioTrack;

  export interface MP4Info {
    duration: number;
    timescale: number;
    fragment_duration: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    brands: string[];
    created: Date;
    modified: Date;
    tracks: MP4Track[];
    videoTracks: MP4VideoTrack[];
    audioTracks: MP4AudioTrack[];
  }

  export type MP4ArrayBuffer = ArrayBuffer & { fileStart: number };

  export type SPS = {
    length: number;
    nalu: Uint8Array;
  };

  export type PPS = {
    length: number;
    nalu: Uint8Array;
  };

  export type AvccBox = {
    AVCLevelIndication: number;
    AVCProfileIndication: number;
    PPS: PPS[];
    SPS: SPS[];
    configurationVersion: number;
    hdr_size: number;
    lengthSizeMinusOne: number;
    nb_PPS_nalus: number;
    nb_SPS_nalus: number;
    profile_compatibility: number;
    size: number;
    start: number;
    type: 'acvC';
    uuid: string;
  };

  export type Sample = {
    alreadyRead: number;
    chunk_index: number;
    cts: number;
    data: UInt8Array;
    degradation_priority: number;
    depends_on: number;
    description: unknown; // deeply nested, we are not using
    description_index: 0;
    dts: number;
    duration: number;
    has_redundancy: boolean;
    is_depended_on: boolean;
    is_leading: number;
    is_sync: boolean;
    number: number;
    offset: number;
    size: number;
    timescale: number;
    track_id: number;
  };
  export interface MP4File {
    onMoovStart?: () => void;
    onReady?: (info: MP4Info) => void;
    onError?: (e: string) => void;

    appendBuffer(data: MP4ArrayBuffer): number;
    start(): void;
    stop(): void;
    flush(): void;

    // user's type will come from setExtractionOptions call
    onSamples?: (trackId: number, user: any, samples: Sample[]) => void;

    // "user" allows passing things into each onSamples call
    setExtractionOptions(
      trackId: number,
      user?: any,
      options?: { nbSamples: number; rapAlignment: boolean }
    );

    // TODO - enhance
    moov: any;
    getTrackById: any;
  }

  export function createFile(): MP4File;

  export {};
}
