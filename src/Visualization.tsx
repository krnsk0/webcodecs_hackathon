import { useEffect, useState } from 'react';
import { Player } from './player/player';

interface VisualizationProps {
  player?: Player;
}

const DATA_POLL_RATE = 50;

export const Visualization = ({ player }: VisualizationProps) => {
  const [vizData, setVizData] =
    useState<ReturnType<Player['visualizationData']>>();

  useEffect(() => {
    const interval = setInterval(() => {
      if (!player) return;
      setVizData(player.visualizationData());
    }, DATA_POLL_RATE);
    return () => clearInterval(interval);
  }, [setVizData, player]);

  return (
    <div className="viz-outer">
      <div className="viz-column-outer">
        <div className="viz-column-header">
          <strong>demuxed samples</strong>
          <div>count: {vizData?.demuxedChunks?.length ?? 0}</div>
        </div>
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
        <div className="viz-column-header">
          <strong>decoding samples</strong>
          <div>count: {vizData?.decodingChunks?.length ?? 0}</div>
        </div>
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
        <div className="viz-column-header">
          <strong>converting frames</strong>
          <div>count: {vizData?.convertingFrames?.length ?? 0}</div>
        </div>
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
        <div className="viz-column-header">
          <strong>buffered frames</strong>
          <div>count: {vizData?.bufferedFrames?.length ?? 0}</div>
        </div>
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
