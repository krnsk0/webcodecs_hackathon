export const isWebCodecsSupported = () => {
  const videoDecoderPresent =
    typeof window !== 'undefined' && 'VideoDecoder' in window;
  const audioDecoderPresent =
    typeof window !== 'undefined' && 'AudioDecoder' in window;
  return videoDecoderPresent && audioDecoderPresent;
};
