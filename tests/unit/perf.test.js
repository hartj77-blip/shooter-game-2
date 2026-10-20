// Automatic graphics quality (core/perf.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQualityGovernor, PERF } from '../../src/core/perf.js';

test('a slow game steps the quality down once it has been slow for a while; a slow moment changes nothing', () => {
  const g = createQualityGovernor();
  const run = (seconds, fps, q) => { let out = null; for (let t = 0; t < seconds; t += 0.1) out = g.update(0.1, fps, q) ?? out; return out; };
  assert.equal(run(PERF.hold - 1, 20, 'high'), null, 'not yet');
  assert.equal(run(0.5, 60, 'high'), null, 'a good moment resets the clock');
  assert.equal(run(PERF.hold - 1, 20, 'high'), null);
  assert.equal(run(1.5, 20, 'high'), 'medium');
  assert.equal(run(PERF.hold + 1, 20, 'low'), null, 'nothing below low');
  assert.equal(run(30, 60, 'medium'), null, 'it never steps back up by itself');
});
