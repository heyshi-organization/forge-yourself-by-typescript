/** 現在時刻の取得を抽象化する。テストで時刻を固定・進行させるために注入する。 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** テスト用: 手動で進められる時計。 */
export class ManualClock implements Clock {
  private current: number;
  constructor(start: Date | string = '2026-01-01T00:00:00.000Z') {
    this.current = new Date(start).getTime();
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

export function nowIso(clock: Clock): string {
  return clock.now().toISOString();
}
