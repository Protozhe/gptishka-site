import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('server.js', 'utf8');
assert(source.indexOf('app.use(blockPrivatePaymentStorage)') > 0);
assert(source.indexOf('app.use(blockPrivatePaymentStorage)') < source.indexOf('express.static(__dirname'));
const result = spawnSync(process.execPath, ['--test', 'server/private-payment-storage.test.js'], { stdio: 'inherit' });
assert.equal(result.status, 0, 'Payment storage privacy regression');
