type AccessFieldListener = (isOpen: boolean, targetSurfaceId?: string) => void;

class AccessFieldStateBus {
  private isOpen = false;
  private targetSurfaceId?: string;
  private listeners = new Set<AccessFieldListener>();

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public getTargetSurfaceId(): string | undefined {
    return this.targetSurfaceId;
  }

  public open(targetSurfaceId?: string): void {
    this.targetSurfaceId = targetSurfaceId;
    if (!this.isOpen || targetSurfaceId) {
      this.isOpen = true;
      this.notify();
    }
  }

  public close(): void {
    if (this.isOpen) {
      this.isOpen = false;
      this.targetSurfaceId = undefined;
      this.notify();
    }
  }

  public toggle(): void {
    this.isOpen = !this.isOpen;
    if (!this.isOpen) {
      this.targetSurfaceId = undefined;
    }
    this.notify();
  }

  public subscribe(listener: AccessFieldListener): () => void {
    this.listeners.add(listener);
    listener(this.isOpen, this.targetSurfaceId);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.isOpen, this.targetSurfaceId);
      } catch (err) {
        console.error('[AccessFieldState] Listener error:', err);
      }
    }
  }
}

export const accessFieldBus = new AccessFieldStateBus();
