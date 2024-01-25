export class WorkDelegator {
  private workers: Worker[] = [];
  private nextWorkerIndex = 0;

  constructor(numberOfWorkers: number, workerUrl: URL | string) {
    for (let i = 0; i < numberOfWorkers; i++) {
      const worker = new Worker(workerUrl);
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
