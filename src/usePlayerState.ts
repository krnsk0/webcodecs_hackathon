import { useEffect, useState } from 'react';
import { Player, PlayerStates } from './player/player';

export const usePlayerState = (player?: Player) => {
  const [state, setState] = useState<PlayerStates>(player?.state ?? 'stopped');

  useEffect(() => {
    if (!player) return;
    const handleStateChange = (event: Event) => {
      if (event instanceof CustomEvent) {
        setState(event.detail.state);
      }
    };
    player.addEventListener('statechange', handleStateChange);
    return () => {
      player.removeEventListener('statechange', handleStateChange);
    };
  }, [player]);
  return state;
};
