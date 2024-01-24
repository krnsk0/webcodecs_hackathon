import { useEffect, useRef } from 'react';
import { Player } from './player/player';

function App() {
  const canvasContainer = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | undefined>(undefined);

  useEffect(() => {
    if (!canvasContainer.current) return;
    const player = new Player();
    playerRef.current = player;
  }, []);

  return <div ref={canvasContainer}></div>;
}

export default App;
