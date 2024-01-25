import { useEffect, useRef } from 'react';
import { AdPod, Player } from './player/player';

const mockAdResponse: AdPod[] = [
  // discover 1080p 24fps AVC
  {
    video:
      'https://ark.tubi-staging.video/v2/cb526b6f284b76e795ab90e876278ad6/f46fa51f-0cd4-4b0b-bed8-4eb35bd35ba9/1920x1080_3400k.mp4',
  },
  // febreeze 480p 24fps AVC
  {
    video:
      'https://ark.tubi.video/939d5096-ce84-45da-8e2b-4ecbdf8cc6f8/854x480_1200k.mp4',
  },
];

function App() {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | undefined>(undefined);

  useEffect(() => {
    if (!canvasContainer.current) return;
    const player = new Player({ container: canvasContainer.current });
    playerRef.current = player;
    player.playAdResponse(mockAdResponse);
  }, []);

  return <div ref={canvasContainer}></div>;
}

export default App;
