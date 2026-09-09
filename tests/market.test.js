import test from 'node:test';import assert from 'node:assert/strict';import {normalizeRule,marketSignals} from '../src/market-rules.js';
const rule=normalizeRule({enabled:true,base:100,multiples:'2,3'});
test('upward crossing, multiple levels and one-shot persistence',()=>{let a=marketSignals(rule,null,100);assert.equal(a.signals.length,0);a=marketSignals(rule,a.state,350);assert.deepEqual(a.signals.map(x=>x.multiple),[2,3]);let b=marketSignals(rule,a.state,150);b=marketSignals(rule,JSON.parse(JSON.stringify(b.state)),400);assert.equal(b.signals.length,0);});
test('initial already-above threshold does not replay historical alert',()=>assert.equal(marketSignals(rule,null,500).signals.length,0));
test('saved arming cap recovers crossing after market state is lost',()=>{const armed={...rule,armedAtCap:100};const result=marketSignals(armed,null,350);assert.deepEqual(result.signals.map(x=>x.multiple),[2,3]);assert.ok(Number.isFinite(result.state.checkedAt));});
test('invalid or missing market cap preserves prior state',()=>{const a=marketSignals(rule,null,100);for(const n of [null,NaN,undefined,0])assert.deepEqual(marketSignals(rule,a.state,n),{state:a.state,signals:[]});});
test('changing baseline and rearming create quiet new baseline',()=>{let a=marketSignals(rule,null,100);a=marketSignals(rule,a.state,220);const next={...rule,base:200};assert.equal(marketSignals(next,a.state,500).signals.length,0);assert.equal(marketSignals(rule,null,220).signals.length,0);});
test('disabled rule never fires',()=>assert.equal(marketSignals({...rule,enabled:false},{last:100},400).signals.length,0));
test('positive finite inputs, Chinese comma and deduplication',()=>{assert.deepEqual(normalizeRule({enabled:true,base:100,multiples:'3，2,2'}).multiples,[2,3]);for(const base of [0,-1,Infinity,'abc'])assert.throws(()=>normalizeRule({base,multiples:'2'}));assert.throws(()=>normalizeRule({base:100,multiples:'2,x'}));assert.throws(()=>normalizeRule({base:1e308,multiples:'20'}));});

 test('downward crossing and separate direction deduplication',()=>{
 const rule={enabled:true,base:100,multiples:[0.5,1,2],direction:'both'};
 let s=marketSignals(rule,null,150).state;
 let result=marketSignals(rule,s,40);assert.equal(result.signals.length,2);assert.ok(result.signals.every(x=>x.direction==='down'));
 result=marketSignals(rule,result.state,210);assert.equal(result.signals.length,3);assert.ok(result.signals.every(x=>x.direction==='up'));
 assert.equal(marketSignals(rule,result.state,30).signals.length,1);
 });
 test('down-only rules ignore upward crossings',()=>{
 const rule=normalizeRule({enabled:true,base:100,multiples:'1,2',direction:'down'});
 let s=marketSignals(rule,null,50).state;let result=marketSignals(rule,s,250);assert.equal(result.signals.length,0);
 assert.equal(marketSignals(rule,result.state,90).signals.length,2);
 });

test('independent percent multiple and absolute cap tiers',()=>{
 const rule=normalizeRule({enabled:true,base:'1M',tiers:[{direction:'up',mode:'percent',value:100},{direction:'up',mode:'cap',value:'3M'},{direction:'down',mode:'percent',value:20}]});
 assert.deepEqual(rule.tiers.map(t=>t.target),[2000000,3000000,800000]);let s=marketSignals(rule,null,1000000).state;let r=marketSignals(rule,s,3100000);assert.equal(r.signals.length,2);r=marketSignals(rule,r.state,700000);assert.equal(r.signals.length,1);assert.equal(r.signals[0].direction,'down');assert.equal(marketSignals(rule,r.state,600000).signals.length,0);
});
test('invalid drop and duplicate targets rejected',()=>{
 assert.throws(()=>normalizeRule({enabled:true,base:'1M',tiers:[{direction:'down',mode:'percent',value:100}]}));
 assert.throws(()=>normalizeRule({enabled:true,base:'1M',tiers:[{direction:'up',mode:'percent',value:100},{direction:'up',mode:'multiple',value:2}]}));
});
