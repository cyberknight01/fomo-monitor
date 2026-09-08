export function parseCompact(value){const match=String(value).trim().replace(/,/g,'').match(/^(\d+(?:\.\d+)?|\.\d+)\s*([kmb])?$/i);if(!match)return NaN;return Number(match[1])*({k:1e3,m:1e6,b:1e9}[match[2]?.toLowerCase()]??1);}
export function ruleSignature(rule){return JSON.stringify(rule?[rule.base,rule.tiers??null,rule.multiples??null,rule.direction??'up']:null);}
export function normalizeRule(value){
 const base=parseCompact(value.base);if(!Number.isFinite(base)||base<=0)throw new Error('请填写有效基准市值，支持 K / M / B');
 if(Array.isArray(value.tiers)){
  if(!value.tiers.length||value.tiers.length>20)throw new Error('请设置 1–20 档提醒');
  const tiers=value.tiers.map(t=>{if(!['up','down'].includes(t.direction)||!['percent','multiple','cap'].includes(t.mode))throw new Error('提醒类型无效');const v=t.mode==='cap'?parseCompact(t.value):Number(t.value);if(!Number.isFinite(v)||v<=0||(t.mode==='percent'&&t.direction==='down'&&v>=100))throw new Error('数值需大于零，下跌幅度需小于 100%');const target=t.mode==='cap'?v:t.mode==='multiple'?base*v:base*(1+(t.direction==='up'?1:-1)*v/100);if(!Number.isFinite(target)||target<=0)throw new Error('目标市值无效');return {direction:t.direction,mode:t.mode,value:v,target};});
  if(new Set(tiers.map(t=>t.direction+':'+t.target)).size!==tiers.length)throw new Error('存在相同方向和目标的重复档位');
  return {enabled:!!value.enabled,base,tiers};
 }
 const multiples=[...new Set(String(value.multiples??'2,3').split(/[,，\s]+/).filter(Boolean).map(Number))].sort((a,b)=>a-b);
 if(!multiples.length||multiples.length>20||multiples.some(n=>!Number.isFinite(n)||n<=0||!Number.isFinite(n*base)))throw new Error('请填写正数基准市值和有效倍数（最多 20 档）');
 const direction=value.direction??'up';if(!['up','down','both'].includes(direction))throw new Error('无效提醒方向');return {enabled:!!value.enabled,base,multiples,direction};
}
export function marketSignals(rule,previous,marketCap){
 if(!rule?.enabled||!Number.isFinite(marketCap)||marketCap<=0)return {state:previous,signals:[]};
 const signature=ruleSignature(rule);const old=previous?.signature===signature?previous:null;const fired=new Set(old?.fired??[]),signals=[];
 const tiers=rule.tiers??rule.multiples.flatMap(multiple=>(rule.direction==='both'?['up','down']:[rule.direction??'up']).map(direction=>({direction,target:rule.base*multiple,multiple})));
 if(old)for(const t of tiers){const multiple=t.multiple??t.target/rule.base;const id=t.direction==='up'?multiple:'down:'+multiple;const crossed=t.direction==='up'?old.last<t.target&&marketCap>=t.target:old.last>t.target&&marketCap<=t.target;if(!fired.has(id)&&crossed){fired.add(id);signals.push({multiple,target:t.target,marketCap,base:rule.base,direction:t.direction});}}
 return {state:{signature,last:marketCap,fired:[...fired]},signals};
}
