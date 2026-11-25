/** starter で未実装の箇所が投げるエラー。どの課題で実装するかを示す。 */
export class NotImplementedError extends Error {
  constructor(exercise: string) {
    super(`未実装です。docs/exercises/${exercise}-*.md を読んで実装してください。`);
    this.name = 'NotImplementedError';
  }
}
