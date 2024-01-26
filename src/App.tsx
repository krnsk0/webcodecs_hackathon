import { useEffect, useRef, useState } from 'react';
import { AdPod, Player } from './player/player';
import { Visualization } from './Visualization';
import { Metrics } from './Metrics';
import { isWebCodecsSupported } from './isWebcodecsSupported';
import {
  FAST_UI_UPDATE_INTERVAL,
  SLOW_UI_UPDATE_INTERVAL,
} from './player/config';

const mockAdResponse: AdPod[] = [
  // febreeze 480p 24fps AVC
  {
    video:
      'https://ark.tubi.video/939d5096-ce84-45da-8e2b-4ecbdf8cc6f8/854x480_1200k.mp4',
  },
  // grubhub 480p 24fps AVC
  {
    video:
      'https://ark.tubi.video/24877d7d-a7cc-4045-82d0-e6b0069b831e/854x480_1200k.mp4',
  },
  // discover 1080p 24fps AVC
  {
    video:
      'https://ark.tubi-staging.video/v2/cb526b6f284b76e795ab90e876278ad6/f46fa51f-0cd4-4b0b-bed8-4eb35bd35ba9/1920x1080_3400k.mp4',
  },
];

function App() {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const [player, setPlayerState] = useState<Player>();
  const [slowUiMode, setSlowUiMode] = useState<boolean>(false);

  const startEverything = () => {
    if (!canvasContainer.current) return;
    const player = new Player({ container: canvasContainer.current });
    setPlayerState(player);
    player.playAdResponse(mockAdResponse);
  };

  const toggleSlowUiMode = () => {
    setSlowUiMode(!slowUiMode);
  };

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        startEverything();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  });

  const uiUpdateInterval = slowUiMode
    ? SLOW_UI_UPDATE_INTERVAL
    : FAST_UI_UPDATE_INTERVAL;

  if (!isWebCodecsSupported()) {
    return (
      <div>
        <div>WebCodecs is not supported in this browser.</div>
        {!window.isSecureContext && (
          <div>This may just be because you are not in a secure context</div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="controls">
        <button onClick={startEverything} autoFocus>
          start [spacebar]
        </button>
        <button onClick={() => window.location.reload()}>reload page</button>
        <label>
          <input
            type="checkbox"
            checked={slowUiMode}
            onChange={toggleSlowUiMode}
          ></input>
          slow ui mode
        </label>
      </div>
      <div className="upper">
        <div ref={canvasContainer} id="canvas-container"></div>
        <Metrics player={player} uiUpdateInterval={uiUpdateInterval} />
      </div>

      {!slowUiMode && (
        <Visualization player={player} uiUpdateInterval={uiUpdateInterval} />
      )}
    </>
  );
}

export default App;
