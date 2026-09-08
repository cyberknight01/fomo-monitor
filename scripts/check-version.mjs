import fs from 'node:fs';
import assert from 'node:assert/strict';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
assert.match(pkg.version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
assert.equal(pkg.version,manifest.version,'package and manifest versions must match');
const tag=process.env.GITHUB_REF_TYPE==='tag'?process.env.GITHUB_REF_NAME:process.argv[2];
if(tag)assert.equal(tag,'v'+pkg.version,'tag must match package version');
console.log('Version verified:',pkg.version);
