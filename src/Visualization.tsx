import { useEffect, useState } from 'react';
import { Player } from './player/player';

interface VisualizationProps {
  player?: Player;
}

export const Visualization = ({ player }: VisualizationProps) => {
  const [debug, setDebug] = useState<ReturnType<Player['visualizationData']>>();

  useEffect(() => {
    const interval = setInterval(() => {
      if (!player) return;
      setDebug(player.visualizationData());
    }, 200);
    return () => clearInterval(interval);
  }, [setDebug, player]);

  if (!player) return null;
  return (
    <div className="viz-outer">
      <div className="viz-column">
        {debug?.demuxedChunks?.map((chunk) => {
          return (
            <div key={chunk.timestamp} className="viz-frame">
              {chunk.timestamp}
            </div>
          );
        })}
      </div>
      <div className="viz-column"></div>
      <div className="viz-column"></div>
      <div className="viz-column"></div>
    </div>
  );
};
