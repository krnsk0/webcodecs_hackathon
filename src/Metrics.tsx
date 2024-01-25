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
        <span>framerate</span>
        <span>{sourceFramerate}</span>
      </div>
    </div>
  );
};
