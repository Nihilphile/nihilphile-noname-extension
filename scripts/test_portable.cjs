const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'tests');
const suites = JSON.parse(fs.readFileSync(path.join(directory, 'suites.json'), 'utf8'));
assert.deepEqual(Object.keys(suites).sort(), ['benchmarks', 'helpers', 'native', 'portable']);
const listed = Object.values(suites).flat();
assert.equal(new Set(listed).size, listed.length, 'Each test entry must belong to exactly one group');
assert.deepEqual(listed.sort(), fs.readdirSync(directory).filter(name => name.endsWith('.js')).sort(), 'Classify every top-level test entry in tests/suites.json');
assert.ok(suites.portable.length > 0, 'Portable suite must not be empty');

for (const file of suites.portable) {
    console.log(`RUN ${file}`);
    const result = spawnSync(process.execPath, [path.join(directory, file)], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`PASS ${suites.portable.length} portable test scripts`);
console.log(`Not executed here: ${suites.native.length} external-engine test scripts, ${suites.benchmarks.length} benchmark, ${suites.helpers.length} fixture module`);
