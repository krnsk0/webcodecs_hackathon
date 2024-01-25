import { useEffect, useState } from 'react';
import { Player } from './player/player';

interface DataProps {
  player?: Player;
}

const DATA_POLL_RATE = 50;

export const Metrics = ({ player }: DataProps) => {
  const [data, setData] = useState<ReturnType<Player['getMetrics']>>();

  useEffect(() => {
    const interval = setInterval(() => {
      if (!player) return;
      setData(player.getMetrics());
    }, DATA_POLL_RATE);
    return () => clearInterval(interval);
  }, [setData, player]);

  const url = data?.url?.split('/').pop() ?? 'none';
  const dimensions = `${data?.sourceWidth ?? 0}x${data?.sourceHeight ?? 0}`;
  const codec = data?.sourceCodec ?? 'unknown';
  const sourceFramerate = `${data?.sourceFramerate.toFixed(2) ?? '0'} fps`;
  const decodeFramerate = `${data?.decodeFramerate.toFixed(2) ?? '0'} fps`;
  const conversionFramerate = `${data?.conversionFramerate.toFixed(2) ?? '0'} fps`;
  const animationFramerate = `${data?.animationFramerate.toFixed(2) ?? '0'} fps`;
  const playbackFramerate = `${data?.playbackFramerate.toFixed(2) ?? '0'} fps`;
  const droppedFrames = data?.droppedFrames ?? 0;
  const bufferedTime = `${data?.bufferedTime.toFixed(2) ?? '0'} sec`;
  const bufferSizeMb = `${((data?.videoBufferSizeBytes ?? 0) / 1024 / 1024).toFixed(2)} MB`;
  const audioBufferSizeMb = `${((data?.audioBufferSizeBytes ?? 0) / 1024 / 1024).toFixed(2)} MB`;

  return (
    <div className="metrics">
      <div className="metrics-row">
        <span>file</span>
        <span>{url}</span>
      </div>
      <div className="metrics-row">
        <span>dimensions</span>
        <span>{dimensions}</span>
      </div>
      <div className="metrics-row">
        <span>codec</span>
        <span>{codec}</span>
      </div>
      <div className="metrics-row">
        <span>source framerate</span>
        <span>{sourceFramerate}</span>
      </div>
      <div className="metrics-row">
        <span>decode framerate</span>
        <span>{decodeFramerate}</span>
      </div>
      <div className="metrics-row">
        <span>bitmap framerate</span>
        <span>{conversionFramerate}</span>
      </div>
      <div className="metrics-row">
        <span>browser framerate</span>
        <span>{animationFramerate}</span>
      </div>
      <div className="metrics-row">
        <span>playback framerate</span>
        <span
          style={{
            backgroundColor: 'black',
            color: 'white',
            padding: '0 0.4em',
          }}
        >
          {playbackFramerate}
        </span>
      </div>
      <div className="metrics-row">
        <span>dropped frames</span>
        <span>{droppedFrames}</span>
      </div>
      <div className="metrics-row">
        <span>buffered time</span>
        <span>{bufferedTime}</span>
      </div>
      <div className="metrics-row">
        <span>video buffer size</span>
        <span>{bufferSizeMb}</span>
      </div>
      <div className="metrics-row">
        <span>audio buffer size</span>
        <span>{audioBufferSizeMb}</span>
      </div>
    </div>
  );
};
