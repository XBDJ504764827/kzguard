import { seedState } from '../data/seed.js';
import type { AppState } from '../types/index.js';

const clone = <T>(value: T): T => structuredClone(value);

class AppStore {
  private state: AppState;

  constructor() {
    this.state = clone(seedState);
  }

  getState() {
    return clone(this.state);
  }

  update(updater: (currentState: AppState) => AppState) {
    this.state = updater(this.getState());
    return this.getState();
  }
}

export const appStore = new AppStore();
