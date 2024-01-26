import {
  MP4ArrayBuffer,
  MP4AudioTrack,
  MP4File,
  MP4Info,
  MP4VideoTrack,
  Sample,
} from 'mp4box';
import * as MP4Box from 'mp4box';
import { Writer } from './writer';

export interface EncodedVideoChunkWithDts {
  encodedVideoChunk: EncodedVideoChunk;
  dts: number;
}

type OnVideoDecoderConfigReady = (config: VideoDecoderConfig) => void;
type OnAudioDecoderConfigReady = (config: AudioDecoderConfig) => void;
type OnVideoChunk = (chunk: EncodedVideoChunkWithDts) => void;
type OnAudioChunk = (chunk: EncodedAudioChunk) => void;

interface DemuxerSetup {
  mp4Blob: Blob;
  onVideoDecoderConfigReady: OnVideoDecoderConfigReady;
  onAudioDecoderConfigReady: OnAudioDecoderConfigReady;
  onAudioChunk: OnAudioChunk;
  onVideoChunk: OnVideoChunk;
}

export class Demuxer {
  private async extractFileInfo(
    blob: Blob
  ): Promise<{ file: MP4File; info: MP4Info }> {
    const file = MP4Box.createFile();
    const buffer = (await blob.arrayBuffer()) as MP4ArrayBuffer;
    return new Promise((resolve, reject) => {
      buffer.fileStart = 0;

      const mp4ArrayBuffer = buffer as MP4ArrayBuffer;
      mp4ArrayBuffer.fileStart = 0;

      file.onReady = (info: MP4Info) => {
        resolve({ info, file });
      };

      file.onError = (error: string) => {
        // TODO: do something better here
        console.error(error);
        reject();
      };

      file.appendBuffer(mp4ArrayBuffer);
      file.flush();
    });
  }

  /**
   * Mostly copypasta, but this is a decent explainer
   * {@link} https://aviadr1.blogspot.com/2010/05/h264-extradata-partially-explained-for.html
   */
  private getDescription(file: MP4File): Uint8Array {
    const avccBox = file.moov.traks[0].mdia.minf.stbl.stsd.entries[0].avcC;
    if (!avccBox)
      throw new Error('no AVCC Box found, cannot write description');

    let i;
    let size = 7;
    for (i = 0; i < avccBox.SPS.length; i++) {
      // nalu length is encoded as a uint16.
      size += 2 + avccBox.SPS[i].length;
    }
    for (i = 0; i < avccBox.PPS.length; i++) {
      // nalu length is encoded as a uint16.
      size += 2 + avccBox.PPS[i].length;
    }
    const writer = new Writer(size);
    writer.writeUint8(avccBox.configurationVersion);
    writer.writeUint8(avccBox.AVCProfileIndication);
    writer.writeUint8(avccBox.profile_compatibility);
    writer.writeUint8(avccBox.AVCLevelIndication);
    writer.writeUint8(avccBox.lengthSizeMinusOne + (63 << 2));
    writer.writeUint8(avccBox.nb_SPS_nalus + (7 << 5));
    for (i = 0; i < avccBox.SPS.length; i++) {
      writer.writeUint16(avccBox.SPS[i].length);
      writer.writeUint8Array(avccBox.SPS[i].nalu);
    }
    writer.writeUint8(avccBox.nb_PPS_nalus);
    for (i = 0; i < avccBox.PPS.length; i++) {
      writer.writeUint16(avccBox.PPS[i].length);
      writer.writeUint8Array(avccBox.PPS[i].nalu);
    }
    return writer.getData();
  }

  private getVideoTrackInfo(info: MP4Info): MP4VideoTrack {
    const videoTrackInfo = info.videoTracks[0];
    if (!videoTrackInfo) throw new Error('no video track found');
    return videoTrackInfo;
  }

  private getAudioTrackInfo(info: MP4Info): MP4AudioTrack {
    const audioTrackInfo = info.audioTracks[0];
    if (!audioTrackInfo) throw new Error('no audio track found');
    return audioTrackInfo;
  }

  async demuxMp4Blob({
    mp4Blob,
    onVideoDecoderConfigReady,
    onAudioDecoderConfigReady,
    onVideoChunk,
    onAudioChunk,
  }: DemuxerSetup) {
    const { file, info } = await this.extractFileInfo(mp4Blob);
    const videoTrackInfo = this.getVideoTrackInfo(info);
    const audioTrackInfo = this.getAudioTrackInfo(info);

    onVideoDecoderConfigReady({
      codec: videoTrackInfo.codec,
      codedHeight: videoTrackInfo.video.height,
      codedWidth: videoTrackInfo.video.width,
      description: this.getDescription(file),
    });

    onAudioDecoderConfigReady({
      // TODO - we may need to return a description here, but no idea how
      // to figure it out
      codec: audioTrackInfo.codec,
      numberOfChannels: audioTrackInfo.audio.channel_count,
      sampleRate: audioTrackInfo.audio.sample_rate,
    });

    file.onSamples = (
      trackId: number,
      // no idea what this is
      _user: unknown,
      samples: Sample[]
    ) => {
      if (trackId === audioTrackInfo.id) {
        for (const sample of samples) {
          onAudioChunk(
            new EncodedAudioChunk({
              type: sample.is_sync ? 'key' : 'delta',
              timestamp: (1000 * sample.cts) / sample.timescale,
              duration: (1000 * sample.duration) / sample.timescale,
              data: sample.data,
            })
          );
        }
      }
      if (trackId === videoTrackInfo.id) {
        for (const sample of samples) {
          onVideoChunk({
            encodedVideoChunk: new EncodedVideoChunk({
              type: sample.is_sync ? 'key' : 'delta',
              // composition time stamp (CTS) is the display order
              timestamp: (1000 * sample.cts) / sample.timescale,
              duration: (1000 * sample.duration) / sample.timescale,
              data: sample.data,
            }),
            // this *MIGHT* be useful in figuring out how many
            // chunks to push to get a certain cts back
            dts: (1000 * sample.dts) / sample.timescale,
          });
        }
      }
    };

    file.setExtractionOptions(videoTrackInfo.id);
    file.setExtractionOptions(audioTrackInfo.id);
    file.start();
  }
}
