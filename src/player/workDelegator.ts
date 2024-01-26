
const workerScript = `

onmessage = async (event) => {
  const { timestamp, videoFrame } = event.data;
  const startTime = Date.now();
  const bitmap = await createImageBitmap(videoFrame);
  const duration = Date.now() - startTime;
  videoFrame.close();
  //@ts-expect-error no overload matches this call, but the types are a lie
  postMessage({ timestamp, bitmap, duration }, [bitmap]);
};

`;

export class WorkDelegator {
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;

  constructor(numberOfWorkers: number) {
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    for (let i = 0; i < numberOfWorkers; i++) {
      const worker = new Worker(URL.createObjectURL(blob));
      this.workers.push(worker);
    }
  }

  // TODO - need generics here for message type
  postMessageToNextWorker(message: unknown, transferables: Transferable[]) {
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    worker.postMessage(message, transferables);
  }

  onMessageFromAnyWorker(callback: (event: MessageEvent) => void) {
    this.workers.forEach((worker) => {
      worker.onmessage = callback;
    });
  }
}
