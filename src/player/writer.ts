/**
 * Adapted from
 * {@link} https://github.com/w3c/webcodecs/blob/main/samples/video-decode-display/demuxer_mp4.js
 */
export class Writer {
  data: Uint8Array;
  idx: number;
  size: number;

  constructor(size: number) {
    this.data = new Uint8Array(size);
    this.idx = 0;
    this.size = size;
  }

  getData(): Uint8Array {
    if (this.idx != this.size)
      throw 'Mismatch between size reserved and sized used';
    return this.data.slice(0, this.idx);
  }

  writeUint8(value: number): void {
    this.data.set([value], this.idx);
    this.idx++;
  }

  writeUint16(value: number): void {
    const arr = new Uint16Array(1);
    arr[0] = value;
    const buffer = new Uint8Array(arr.buffer);
    this.data.set([buffer[1], buffer[0]], this.idx);
    this.idx += 2;
  }

  writeUint8Array(value: Uint8Array): void {
    this.data.set(value, this.idx);
    this.idx += value.length;
  }
}
