import { randomUUID } from 'node:crypto';

/** ID生成を抽象化する。テストで決定的なIDを使うために注入する。 */
export interface IdGenerator {
  next(): string;
}

export const uuidGenerator: IdGenerator = { next: () => randomUUID() };

/** テスト用: req-1, req-2, ... を返す。 */
export class SequentialIds implements IdGenerator {
  private n = 0;
  constructor(private readonly prefix = 'req') {}
  next(): string {
    this.n += 1;
    return `${this.prefix}-${this.n}`;
  }
}
