/**
 * Minimal in-process concurrency limiter for CPU-heavy work (sharp, ONNX).
 * The app is single-user, so a queue is enough; there is no job system.
 */
export class Limiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.concurrency) {
      this.active++;
    } else {
      // The releasing task hands its slot directly to us, so `active` is unchanged.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
