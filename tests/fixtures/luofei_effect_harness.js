const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const runtimeFile = path.join(__dirname, '../jie_luofei_ai_runtime_test.js');
const behaviorFile = path.join(__dirname, '../jie_luofei_behavior_test.js');
module.exports = function load(aiSource) {
    let behavior = fs.readFileSync(behaviorFile, 'utf8');
    behavior = behavior.replace(/^const aiSource = .*;$/m, 'const aiSource = ' + JSON.stringify(aiSource) + ';');
    let runtime = fs.readFileSync(runtimeFile, 'utf8');
    runtime = runtime.slice(0, runtime.lastIndexOf('(async () => {'));
    runtime = runtime.replace("const source = fs.readFileSync(fixtureFile, 'utf8');", 'const source = ' + JSON.stringify(behavior) + ';');
    const context = vm.createContext({require:createRequire(runtimeFile), __dirname:path.dirname(runtimeFile), console, process, Buffer, setTimeout});
    vm.runInContext(runtime + '\nglobalThis.api = {fixture,harness};', context);
    return context.api;
};
