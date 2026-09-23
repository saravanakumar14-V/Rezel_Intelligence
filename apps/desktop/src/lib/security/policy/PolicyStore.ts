import type { ResourceScope } from './PolicyTypes';

export class PolicyStore {
  private static globalScopes: ResourceScope[] = [];

  static addScope(scope: ResourceScope) {
    this.globalScopes.push(scope);
  }

  static getGlobalScopes(): ResourceScope[] {
    return [...this.globalScopes];
  }

  static clear() {
    this.globalScopes = [];
  }
}
