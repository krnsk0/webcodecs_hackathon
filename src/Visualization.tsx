import { useEffect, useState } from 'react';
import { Player } from './player/player';

interface VisualizationProps {
  player?: Player;
}

export const Visualization = ({ player }: VisualizationProps) => {
  const [vizData, setVizData] =
    useState<ReturnType<Player['visualizationData']>>();

  useEffect(() => {
    const interval = setInterval(() => {
      if (!player) return;
      setVizData(player.visualizationData());
    }, 200);
    return () => clearInterval(interval);
  }, [setVizData, player]);

  if (!player) return null;
  return (
    <div className="viz-outer">
      <div className="viz-column-outer">
        <strong>demuxed samples</strong>
        <div>count: {vizData?.demuxedChunks?.length}</div>
        <div className="viz-column-inner">
          {vizData?.demuxedChunks?.map((chunk) => {
            const timestamp = chunk.encodedVideoChunk.timestamp;
            return (
              <div
                key={timestamp}
                className="viz-frame"
                style={{ backgroundColor: 'darkblue' }}
              >
                {timestamp}
              </div>
            );
          })}
        </div>
      </div>
      <div className="viz-column-outer">
        <strong>decoding samples</strong>
        <div>count: {vizData?.decodingChunks?.length}</div>
        <div className="viz-column-inner">
          {vizData?.decodingChunks?.map((timestamp) => {
            return (
              <div
                key={timestamp}
                className="viz-frame"
                style={{ backgroundColor: 'darkred' }}
              >
                {timestamp}
              </div>
            );
          })}
        </div>
      </div>
      <div className="viz-column-outer">
        <strong>converting frames</strong>
        <div>count: {vizData?.convertingFrames?.length}</div>
        <div className="viz-column-inner">
          {vizData?.convertingFrames?.map((timestamp) => {
            return (
              <div
                key={timestamp}
                className="viz-frame"
                style={{ backgroundColor: 'purple' }}
              >
                {timestamp}
              </div>
            );
          })}
        </div>
      </div>
      <div className="viz-column-outer">
        <strong>buffered frames</strong>
        <div>count: {vizData?.bufferedFrames?.length}</div>
        <div className="viz-column-inner">
          {vizData?.bufferedFrames?.map((frame) => {
            return (
              <div
                key={frame.timestamp}
                className="viz-frame"
                style={{ backgroundColor: 'darkgreen' }}
              >
                {frame.timestamp}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
