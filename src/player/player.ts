interface PlayerOptions {
  container: HTMLElement;
}

export interface AdPod {
  video: string;
}

export class Player {
  constructor(private options: PlayerOptions) {}

  async playAdResponse(adResponse: AdPod[]) {}
}
