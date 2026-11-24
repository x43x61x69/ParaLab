// Check release artifacts agree, and reject a stale Paramix menu before publishing.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const menuVersion=fs.readFileSync(path.join(root,'feld/VERSION'),'utf8').trim();
const F=require('../src/feld');
const header=path.join(root,'feld/src/feld/version.h'),before=fs.readFileSync(header);
execFileSync('python3',[path.join(root,'feld/src/feld/gen_version.py')]);
assert.deepEqual(fs.readFileSync(header),before,'version generation must be deterministic');
for (const name of ['feld.bin', 'feldc.bin', 'feld-mylab.bin', 'feld-mylab-paradise.bin']) {
  const binary=fs.readFileSync(path.join(root,'feld',name));
  assert.equal(F.menuVersion(binary,0),menuVersion,name+' Menu version');
  assert.equal(binary.subarray(-32).toString().split('\0')[0],'PMXBLD:'+version,name+' release build');
  const restamped=Buffer.from(binary);
  restamped.fill(0,restamped.length-32);
  restamped.write('PMXBLD:99.99.99',restamped.length-32);
  assert.deepEqual(F.menuPayload(binary),F.menuPayload(restamped),name+' installed bytes');
  assert.equal(F.menuPayload(binary).length,binary.length-32);
}
const older=Buffer.from('PMXVER:0.2.45\0code\0v0.2.45\0');
const updated=Buffer.from('PMXVER:0.2.46\0code\0v0.2.46\0');
const comparison=Buffer.from(updated);
assert(F.preserveMenuVersion(older,comparison,0));
assert.deepEqual(comparison,older);
updated[15]^=1;
assert.equal(F.preserveMenuVersion(older,updated,0),undefined);
const flashBinary=fs.readFileSync(path.join(root,'flash/flashapp.bin'));
assert(!flashBinary.includes(Buffer.from('PMXVER:')));
const flashVersion=fs.readFileSync(path.join(root,'flash/src/version.h'),'utf8');
const flashTag=flashBinary.indexOf('PXMLVER1');
assert(flashTag>=0);
assert.equal(flashBinary.readUInt32LE(flashTag+8),Number(flashVersion.match(/FLASH_TOOL_REVISION (0x[0-9a-f]+)u/)[1]));
const hybridMenu = fs.readFileSync(path.join(root, 'feld/feld-mylab-paradise.bin'));
for (const label of ['GAME BOOT DIAGNOSTIC', 'BOOT STEP', 'SLEEP ENTRY', 'SLEEP WAKE TRACE']) {
  assert(!hybridMenu.includes(Buffer.from(label)), 'release menu contains ' + label);
}
const mismatch={...fs,readFileSync(file,...args){return path.resolve(file)===path.join(root,'VERSION')?'0.0.0-plus.999\n':fs.readFileSync(file,...args);},mkdirSync(){throw Error('unexpected output');},writeFileSync(){throw Error('unexpected output');}};
assert.throws(()=>vm.runInNewContext(fs.readFileSync(path.join(root,'build.js'),'utf8'),{__dirname:root,Buffer,console,require:(name)=>name==='fs'?mismatch:require(name)}),/feld\/feld-mylab\.bin does not match VERSION/);
console.log('PASS: independent Menu and Flash Tool versions, stable installed Menu payload, stale-build rejection');
