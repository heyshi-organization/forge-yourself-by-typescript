import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REQUEST_STATUSES } from '@app/domain/request.js';
import type { RequestStatus } from '@app/domain/request.js';
import {
  ALLOWED_TRANSITIONS,
  InvalidTransitionError,
  assertNever,
  assertTransition,
  canTransition,
  isTerminal,
} from '@app/domain/state-machine.js';

describe('state machine', () => {
  it('許可される遷移は PENDING→PROCESSING→SUCCEEDED|FAILED のみ', () => {
    const allowed = REQUEST_STATUSES.flatMap((from) =>
      REQUEST_STATUSES.filter((to) => canTransition(from, to)).map((to) => `${from}->${to}`),
    );
    expect(allowed.sort()).toEqual(
      ['PENDING->PROCESSING', 'PROCESSING->FAILED', 'PROCESSING->SUCCEEDED'].sort(),
    );
  });

  it('終端状態は SUCCEEDED と FAILED', () => {
    expect(REQUEST_STATUSES.filter(isTerminal)).toEqual(['SUCCEEDED', 'FAILED']);
  });

  it('不正な遷移は InvalidTransitionError', () => {
    expect(() => assertTransition('SUCCEEDED', 'FAILED')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('PENDING', 'SUCCEEDED')).toThrow('PENDING -> SUCCEEDED');
    expect(() => assertTransition('PENDING', 'PROCESSING')).not.toThrow();
  });

  it('assertNever は到達したら例外', () => {
    expect(() => assertNever('x' as never)).toThrow();
  });

  it('property: どんな遷移列をたどっても、終端状態から先へは進めない', () => {
    const status = fc.constantFrom<RequestStatus>(...REQUEST_STATUSES);
    fc.assert(
      fc.property(fc.array(status, { maxLength: 20 }), (targets) => {
        let current: RequestStatus = 'PENDING';
        for (const to of targets) {
          if (canTransition(current, to)) current = to;
        }
        // 終端状態に着いたら、そこから出る遷移は存在しない
        if (isTerminal(current)) {
          expect(ALLOWED_TRANSITIONS[current]).toHaveLength(0);
        }
      }),
    );
  });
});
