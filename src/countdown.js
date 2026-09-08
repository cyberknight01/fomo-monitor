export function countdown(config,state,schedule,hasAuth,now=Date.now()){
 if(!config.enabled)return {market:'已暂停',kol:'已暂停'};
 if(!hasAuth||String(state.status??'').includes('会话缺失或失效'))return {market:'待同步',kol:'待同步'};
 if(state.retryAt>now)return {market:'限流 '+duration(state.retryAt-now),kol:'限流 '+duration(state.retryAt-now)};
 if(schedule?.inProgress)return {market:'检查中',kol:'检查中'};
 const next=schedule?.nextAt;
 if(!Number.isFinite(next))return {market:'待调度',kol:'待调度'};
 const market=next<=now?'等待执行':duration(next-now);
 const positions=(state.own?.positions??[]).filter(p=>!p.uncertain);
 if(!positions.length)return {market,kol:'无持仓'};
 const due=Math.min(...positions.map(p=>(state.tokens?.[p.key]?.at??0)+config.kolMinutes*60000));
 const interval=Math.max(30000,config.pollMinutes*60000);
 const kolAt=next+Math.max(0,Math.ceil((due-next)/interval))*interval;
 return {market,kol:kolAt<=now?'等待执行':duration(kolAt-now)};
}
export function duration(ms){const sec=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
