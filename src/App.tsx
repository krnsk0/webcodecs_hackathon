import { useEffect, useRef, useState } from 'react';
import { AdPod, Player } from './player/player';
import { Visualization } from './Visualization';

const mockAdResponse: AdPod[] = [
  // febreeze 480p 24fps AVC
  {
    video:
      'https://ark.tubi.video/939d5096-ce84-45da-8e2b-4ecbdf8cc6f8/854x480_1200k.mp4',
  },
  // discover 1080p 24fps AVC
  // {
  //   video:
  //     'https://ark.tubi-staging.video/v2/cb526b6f284b76e795ab90e876278ad6/f46fa51f-0cd4-4b0b-bed8-4eb35bd35ba9/1920x1080_3400k.mp4',
  // },
  // grubhub 480p 24fps AVC
  // {
  //   video:
  //     'https://ark.tubi.video/24877d7d-a7cc-4045-82d0-e6b0069b831e/854x480_1200k.mp4',
  // },
];

function App() {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const [player, setPlayerState] = useState<Player>();

  const startEverything = () => {
    if (!canvasContainer.current) return;
    const player = new Player({ container: canvasContainer.current });
    setPlayerState(player);
    player.playAdResponse(mockAdResponse);
  };

  useEffect(() => {
    startEverything();
  }, []);

  return (
    <>
      <div ref={canvasContainer} id="canvas-container"></div>
      <div className="controls">
        <button onClick={startEverything}>reset</button>
      </div>
      <Visualization player={player} />
    </>
  );
}

export default App;
