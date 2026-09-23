export interface ApplicationHandoffAdapter {
  readonly appId: string;
  readonly displayName: string;
  isInstalled(): Promise<boolean>;
  launch(background?: boolean): Promise<void>;
  focus(): Promise<void>;
  supportsObservation(): boolean;
}

class ApplicationHandoffRegistryImpl {
  private adapters = new Map<string, ApplicationHandoffAdapter>();

  public register(adapter: ApplicationHandoffAdapter): void {
    this.adapters.set(adapter.appId, adapter);
  }

  public unregister(appId: string): void {
    this.adapters.delete(appId);
  }

  public get(appId: string): ApplicationHandoffAdapter | undefined {
    return this.adapters.get(appId);
  }

  public getAll(): ApplicationHandoffAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const ApplicationHandoffRegistry = new ApplicationHandoffRegistryImpl();
