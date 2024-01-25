interface DecodedFrame {
  timestamp: number;
  videoFrame: VideoFrame;
}

onmessage = async (event) => {
  const { timestamp, videoFrame } = event.data as DecodedFrame;
  const startTime = Date.now();
  const bitmap = await createImageBitmap(videoFrame);
  const duration = Date.now() - startTime;
  videoFrame.close();
  //@ts-expect-error no overload matches this call, but the types are a lie
  postMessage({ timestamp, bitmap, duration }, [bitmap]);
};
