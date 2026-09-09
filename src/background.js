import {normalizeTop} from './rankings.js';
import {formatAlert,enrichEvents,buildAlertMessage} from './notifications.js';
import {normalizeRule,marketSignals,ruleSignature} from './market-rules.js';
import {DEFAULTS,tokenAlertsEnabled,key,positions,normalizeTrade,tradeDiff,validateFriends,unwrap} from './core.js';
const API='https://prod-api.fomo.family';
let queue=Promise.resolve();
const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
const config=async()=>({...DEFAULTS,...(await chrome.storage.local.get('config')).config});
const empty=()=>({marketState:{},own:null,tokens:{},events:[],outbox:[],logs:[],cursor:0,status:'尚未同步',retryAt:0});
const read=async()=>({...empty(),...(await chrome.storage.local.get('state')).state});
const save=async state=>chrome.storage.local.set({state});
function log(s,level,message,meta={}) {s.logs.push({at:Date.now(),level,message,...meta});s.logs=s.logs.slice(-250);}
function errorText(e){const m=String(e?.message??'UNKNOWN');return /^(AUTH_REQUIRED|RATE_LIMIT|API_RESPONSE_\d+)$/.test(m)?m:m.startsWith('字段')||m.length<150&&!/https?:|Bearer|eyJ/i.test(m)?m:'网络或响应错误（敏感细节已省略）';}
async function api(path,auth,state,body) {
  if(!auth?.authorization)throw new Error('AUTH_REQUIRED');
  const started=Date.now();
  let r;
  try {r=await fetch(API+path,{method:body?'POST':'GET',headers:{Authorization:auth.authorization,'Content-Type':'application/json','X-Supported-Chains':'1,56,143,4663,8453,1399811149','App-Language':'zh'},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});}
  catch {log(state,'error','请求失败',{path:path.split('?')[0],ms:Date.now()-started});throw new Error('网络请求失败');}
  log(state,r.ok?'info':'error','API',{path:path.split('?')[0],http:r.status,ms:Date.now()-started});
  if(r.status===429){const seconds=Number(r.headers.get('retry-after'));state.retryAt=Date.now()+Math.max(60,Number.isFinite(seconds)?seconds:300)*1000;}
  const j=await r.json().catch(()=>null);return unwrap(j,r.status);
}
function emit(s,c,e){
  const id=e.eventId??[e.userId,e.tokenKey,e.tradeId,e.type,e.buy,e.sell].join('|');
  if(s.events.some(x=>x.id===id))return;
  const event={...e,id,at:Date.now()};s.events.push(event);s.events=s.events.slice(-500);
  if(tokenAlertsEnabled(c,e.tokenKey) && c.telegramEnabled && (e.type==='MARKET_CAP'||(e.mine?c.alertPositionChanges:c.alertKolChanges)))s.outbox.push({event,attempts:0,nextAt:0});
  if(s.outbox.length>200){s.outbox=s.outbox.slice(-200);log(s,'warn','待发送告警超过 200，已丢弃最早项目');}
}
function signal(s,c,prev,t,user,token,opts){
  const d=tradeDiff(prev,t,opts);
  for(const type of d.actions)emit(s,c,{type,userId:user.id,handle:user.handle,tokenKey:token.key,symbol:token.symbol,tradeId:t.id,buy:t.buy,sell:t.sell,quantity:t.quantity,mine:!!user.mine,reason:d.reason,marketCap:token.marketCap,price:token.price,avgEntryPrice:t.avgEntryPrice,updatedAt:t.updatedAt,windowStart:prev?.observedAt??opts?.baselineAt??0,delta:(type==='BUY'||type==='ADD'?t.buy-(prev?.id===t.id?prev.buy:0):t.sell-(prev?.id===t.id?prev.sell:0))});
  t.observedAt=Date.now();
  return d;
}
async function telegram(c,text,entities=[]){
  if(!/^\d+:[A-Za-z0-9_-]+$/.test(c.telegramBotToken)||!/^(-?\d+|@[A-Za-z0-9_]+)$/.test(c.telegramChatId))throw new Error('请填写有效的 Telegram Bot Token 和 Chat ID');
  let r;try{r=await fetch(`https://api.telegram.org/bot${c.telegramBotToken}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:c.telegramChatId,text:text.slice(0,4000),entities,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new Error('Telegram 网络错误；发送结果可能不确定');}
  const j=await r.json().catch(()=>({}));if(!r.ok||j.ok!==true)throw new Error(`Telegram HTTP ${r.status}`);
}
async function flush(s,c){
  if(!c.telegramEnabled){s.outbox=[];return;}
  for(const item of s.outbox.filter(x=>x.nextAt<=Date.now()).slice(0,3)){
    const e=item.event;const live=await config();if(!tokenAlertsEnabled(live,e.tokenKey)){s.outbox=s.outbox.filter(x=>x!==item);continue;}
    try{const message=buildAlertMessage(e);await telegram(c,message.text,message.entities);s.outbox=s.outbox.filter(x=>x!==item);log(s,'info','Telegram 已发送',{eventId:e.id});}
    catch(err){item.attempts++;item.nextAt=Date.now()+Math.min(3600000,60000*2**item.attempts);log(s,'error',errorText(err));if(item.attempts>=5){s.outbox=s.outbox.filter(x=>x!==item);log(s,'error','告警发送失败已达 5 次，请检查配置',{eventId:e.id});}}
    await save(s);
  }
}
async function ownSnapshot(s,c,auth,profile,deadline){
  const data=await api(`/v2/users/${profile.id}/balances`,auth,s);const next=positions(data);const prev=s.own;
  const user={id:profile.id,handle:profile.userHandle,mine:true};
  // A missing row is never sufficient evidence of an exit.
  const nextKeys=new Set(next.positions.map(p=>p.key));
  if(prev){for(const old of prev.positions){if(!nextKeys.has(old.key)&&old.trade&&!old.trade.closedAt){
    try{if(Date.now()>deadline)throw new Error('本轮预算耗尽，待下一轮确认');const d=await api(`/trades/${old.trade.id}`,auth,s);const t=normalizeTrade(d.trade);if(d.userId!==profile.id||t.key!==old.key)throw new Error('成交身份不匹配');signal(s,c,old.trade,t,user,old);if(!t.closedAt || t.quantity>1e-10)next.positions.push({...old,trade:t,uncertain:true});}
    catch(e){if(['AUTH_REQUIRED','RATE_LIMIT'].includes(e.message))throw e;log(s,'warn','缺失仓位尚未确认关闭',{token:old.key});next.positions.push({...old,uncertain:true});}
  }}}
  for(const p of next.positions){if(p.uncertain)continue;const old=prev?.positions.find(x=>x.key===p.key);if(p.trade){p.state=signal(s,c,old?.trade,p.trade,user,p,{baselineAt:prev?.at??0,allowNew:!!prev}).state;}else p.state='UNKNOWN';}
  s.marketState??={};
  for(const p of next.positions){if(p.uncertain)continue;const result=marketSignals(c.marketRules?.[p.key],s.marketState[p.key],p.marketCap);if(result.state)s.marketState[p.key]=result.state;for(const hit of result.signals)emit(s,c,{...hit,type:'MARKET_CAP',tokenKey:p.key,symbol:p.symbol,mine:true,eventId:`market|${p.key}|${c.marketRules[p.key].revision}|${hit.direction}|${hit.multiple}`});}
  s.own={...next,at:Date.now(),profile:{id:profile.id,handle:profile.userHandle}};await save(s);
}
async function tokenSnapshot(s,c,auth,token,following,deadline){
  const raw=await api('/hodlers/friends',auth,s,{tokens:[{address:token.address,networkId:token.networkId}],limit:50});
  const row=validateFriends(raw,token),prev=s.tokens[token.key];const eventStart=s.events.length;const knownIds=new Set(s.events.map(e=>e.id));
  const allowed=new Set(following);const holders={};
  if(!row.complete)log(s,'warn','关注者列表被截断，未展示的人不判为清仓',{token:token.key,total:row.totalHolders,returned:row.topHolders.length});
  const candidates=new Map(row.topHolders.filter(h=>allowed.has(h.user.id)).map(h=>[h.user.id,{id:h.user.id,handle:h.user.userHandle||h.user.displayName,avatar:h.user.profilePictureLink,displayName:h.user.displayName,tradeId:h.tradeId}]));
  for(const old of Object.values(prev?.holders??{}))if(allowed.has(old.id)&&!candidates.has(old.id)&&old.trade&&!old.trade.closedAt)candidates.set(old.id,{...old,missing:true,tradeId:old.trade.id});
  const users=[...candidates.values()];const offset=(prev?.detailCursor??0)%Math.max(1,users.length);let processed=0;
  for(let index=0;index<users.length;index++){
    const user=users[(offset+index)%users.length];
    if(Date.now()>deadline){holders[user.id]={...(prev?.holders?.[user.id]??user),state:'UNKNOWN',uncertain:true};continue;}
    processed++;
    const old=prev?.holders?.[user.id];
    if(user.missing&&!row.complete){holders[user.id]={...old,state:'UNKNOWN',uncertain:true};continue;}
    try{
      const detail=await api(`/trades/${user.tradeId}`,auth,s);const trade=normalizeTrade(detail.trade);
      if(detail.userId!==user.id||trade.key!==token.key)throw new Error('成交身份不匹配');
      const d=signal(s,c,old?.trade,trade,user,token,{baselineAt:prev?.at??0,allowNew:!!prev&&prev.following.includes(user.id)&&prev.complete});
      holders[user.id]={id:user.id,handle:user.handle,avatar:user.avatar??old?.avatar,displayName:user.displayName??old?.displayName,trade,state:d.state,reason:d.reason,at:Date.now()};
    }catch(e){if(['AUTH_REQUIRED','RATE_LIMIT'].includes(e.message))throw e;holders[user.id]={...(old??user),state:'UNKNOWN',uncertain:true};log(s,'warn','关注者成交待确认',{token:token.key,userId:user.id});}
  }
  // Retain closed positions as EXIT history only while still followed.
  for(const old of Object.values(prev?.holders??{}))if(allowed.has(old.id)&&old.trade?.closedAt&&!holders[old.id])holders[old.id]=old;
  let activity=prev?.activity??[],activityAt=prev?.activityAt??null;
  try{if(!s.events.some(e=>!knownIds.has(e.id)&&e.tokenKey===token.key))throw new Error('ACTIVITY_DISABLED');if(Date.now()>deadline)throw new Error('本轮预算耗尽，活动等待下一轮');const feed=await api(`/feed/token?tokenAddress=${encodeURIComponent(token.address)}&networkId=${token.networkId}&excludeThesis=true&threshold=20`,auth,s);
    if(!Array.isArray(feed.items)||typeof feed.hasNextPage!=='boolean')throw new Error('活动响应结构异常');
    enrichEvents(s,feed.items,token.key,knownIds);
    activity=feed.items.filter(x=>allowed.has(x.userId)&&['swap_buy','swap_sell'].includes(x.type)).slice(0,50).map(x=>({id:x.id,type:x.type,handle:x.userHandle,at:x.createdAt,usdAmount:x.usdAmount}));activityAt=Date.now();
    if(feed.hasNextPage)log(s,'info','活动仅为首屏样本；状态判断使用成交记录',{token:token.key});
  }catch(e){if(['AUTH_REQUIRED','RATE_LIMIT'].includes(e.message))throw e;if(e.message!=='ACTIVITY_DISABLED')log(s,'warn','活动暂未更新',{token:token.key});}
  let ranking=prev?.ranking,rankingError=null;
  try{if(Date.now()>deadline)throw new Error('本轮预算耗尽，排行等待下轮');const top=await api('/hodlers/top?tokens='+encodeURIComponent(JSON.stringify([{address:token.address,networkId:token.networkId}])),auth,s);ranking=normalizeTop(top,token);}catch(e){if(['AUTH_REQUIRED','RATE_LIMIT'].includes(e.message))throw e;rankingError=errorText(e);log(s,'warn','排行暂未更新',{token:token.key});}
  s.tokens[token.key]={ranking,rankingError,detailCursor:(offset+processed)%Math.max(1,users.length),at:Date.now(),complete:row.complete,total:row.totalHolders,following,holders,activity,activityAt};await save(s);
}
async function poll(force=false){
  const deadline=Date.now()+150000;const c=await config(),s=await read();if(!c.enabled&&!force)return;
  if(s.retryAt>Date.now()){s.status='接口限流，等待重试';await save(s);return;}
  try{
    if(!c.myProfile)throw new Error('请先在设置中输入你的 FOMO 名称');
    const auth=(await chrome.storage.session.get('auth')).auth;
    if(!auth?.authorization)throw new Error('AUTH_REQUIRED');
    const cached=s.profileCache;const profile=cached?.owner===auth.owner.id&&cached.handle===c.myProfile&&Date.now()-cached.at<600000?cached.data:await api(`/v2/users/userHandle/${encodeURIComponent(c.myProfile)}`,auth,s);
    if(!profile.id || profile.userHandle?.toLowerCase()!==c.myProfile.toLowerCase())throw new Error('Profile 身份不匹配');
    if(auth.owner.id!==profile.id)throw new Error('登录账号与监控 Profile 不一致，请切换 FOMO 登录账号');
    s.profileCache={owner:auth.owner.id,handle:c.myProfile,data:profile,at:cached?.data===profile?cached.at:Date.now()};
    await ownSnapshot(s,c,auth,profile,deadline);
    const fc=s.followCache;const useFollowCache=!force&&fc?.owner===auth.owner.id&&Date.now()-fc.at<300000;const f=useFollowCache?fc.data:await api('/v2/users/current/followingIds',auth,s);if(!Array.isArray(f.followingIds)||f.followingIds.some(id=>typeof id!=='string'))throw new Error('关注列表结构异常');
    s.followCache={owner:auth.owner.id,data:f,at:useFollowCache?fc.at:Date.now()};s.followingCount=f.followingIds.length;
    // Immediately remove unfollowed accounts from the display and comparison scope.
    for(const t of Object.values(s.tokens))for(const id of Object.keys(t.holders))if(!f.followingIds.includes(id))delete t.holders[id];
    const currentKeys=new Set(s.own.positions.map(p=>p.key));for(const k of Object.keys(s.tokens))if(!currentKeys.has(k))delete s.tokens[k];
    const all=s.own.positions.filter(p=>!p.uncertain&&(force||!s.tokens[p.key]||Date.now()-s.tokens[p.key].at>=c.kolMinutes*60000));const count=Math.min(c.tokensPerRun,all.length);const start=s.cursor%Math.max(1,all.length);
    for(let i=0;i<count;i++){
      if(Date.now()>deadline){log(s,'warn','本轮时间预算已用完，下轮继续');break;}
      const p=all[(start+i)%all.length];
      try{await tokenSnapshot(s,c,auth,p,f.followingIds,deadline);}catch(e){if(['AUTH_REQUIRED','RATE_LIMIT'].includes(e.message))throw e;log(s,'error',errorText(e),{token:p.key});if(s.tokens[p.key])s.tokens[p.key].error=errorText(e);}
      s.cursor=(start+i+1)%all.length;await save(s);
    }
    s.status='已更新 · API 后台轮询';s.lastRun=Date.now();s.retryAt=0;
  }catch(e){s.status=e.message==='AUTH_REQUIRED'?'会话缺失或失效：请手动刷新已登录的 FOMO 页面':e.message==='RATE_LIMIT'?'接口限流，等待重试':errorText(e);log(s,'error',s.status);}
  await save(s);await flush(s,c);
}
async function schedule(){await chrome.alarms.clear('fomo-api-poll');const c=await config();if(c.enabled)await chrome.alarms.create('fomo-api-poll',{periodInMinutes:c.pollMinutes});}
chrome.runtime.onInstalled.addListener(()=>serial(async()=>{await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});if(!(await chrome.storage.local.get('config')).config)await chrome.storage.local.set({config:DEFAULTS});await schedule();}));
chrome.runtime.onStartup.addListener(()=>serial(schedule));
let pendingPoll=null;
function requestPoll(force=false){if(pendingPoll)return pendingPoll;pendingPoll=serial(()=>poll(force)).finally(()=>{pendingPoll=null;});return pendingPoll;}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='fomo-api-poll')requestPoll();});
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  if(m?.type==='SYNC_SESSION'){
    if(sender.id!==chrome.runtime.id||!sender.tab||!sender.url?.startsWith('https://fomo.family/'))return false;
    if(!/^Bearer [A-Za-z0-9_.-]{20,12000}$/.test(m.authorization??'')||!/^[a-f0-9-]{36}$/i.test(m.owner?.id??''))return false;
    chrome.storage.session.set({auth:{authorization:m.authorization,owner:m.owner,at:Date.now()}}).then(()=>respond({ok:true}));return true;
  }
  if(sender.id!==chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')))return false;
  if(m.type==='GET'){(async()=>{const c=await config(),s=await read(),a=(await chrome.storage.session.get('auth')).auth;const alarm=await chrome.alarms.get?.('fomo-api-poll');return {config:{...c,telegramBotToken:c.telegramBotToken?'[saved]':''},state:s,auth:a?{owner:a.owner,at:a.at}:null,schedule:{nextAt:alarm?.scheduledTime??null,inProgress:!!pendingPoll}};})().then(respond,e=>respond({ok:false,error:errorText(e)}));return true;}
  if(m.type==='POLL'){requestPoll(true).then(()=>respond({ok:true}),e=>respond({ok:false,error:errorText(e)}));return true;}
  if(m.type==='FLOAT'){openFloat().then(()=>respond({ok:true}),e=>respond({ok:false,error:errorText(e)}));return true;}
  if(m.type==='TOKEN_ALERTS'){
    (async()=>{const c=await config();if(typeof m.enabled!=='boolean')throw new Error('无效开关');
      if(m.all){c.tokenAlertsDefault=m.enabled;c.tokenAlerts={};}else{if(typeof m.key!=='string'||!m.key)throw new Error('缺少 Token');c.tokenAlerts={...c.tokenAlerts,[m.key]:m.enabled};}
      await chrome.storage.local.set({config:c});
      await serial(async()=>{const s=await read(),live=await config();s.outbox=s.outbox.filter(x=>tokenAlertsEnabled(live,x.event.tokenKey));await save(s);});return {ok:true};
    })().then(respond,e=>respond({ok:false,error:errorText(e)}));return true;
  }
  serial(async()=>{
    if(m.type==='SAVE_RULE'){
      const c=await config(),s=await read();if(!s.own?.positions.some(p=>p.key===m.key)&&!c.marketRules?.[m.key])throw new Error('请先同步此 Token 持仓');
      const rule=normalizeRule(m.rule);const old=c.marketRules?.[m.key];const changed=ruleSignature(old)!==ruleSignature(rule)||old?.enabled!==rule.enabled;
      const p=s.own?.positions.find(p=>p.key===m.key);rule.revision=changed?crypto.randomUUID():old.revision;
      if(changed||m.rearm){rule.revision=crypto.randomUUID();rule.armedAt=Date.now();rule.armedAtCap=Number.isFinite(p?.marketCap)?p.marketCap:null;}else{rule.armedAt=old?.armedAt;rule.armedAtCap=old?.armedAtCap;}
      c.marketRules={...c.marketRules,[m.key]:rule};
      if(changed||m.rearm){s.marketState??={};delete s.marketState[m.key];const result=marketSignals(rule,null,p?.marketCap);if(result.state)s.marketState[m.key]=result.state;await save(s);}
      await chrome.storage.local.set({config:c});return {ok:true};
    }
    if(m.type==='GET'){const c=await config(),s=await read(),a=(await chrome.storage.session.get('auth')).auth;return {config:{...c,telegramBotToken:c.telegramBotToken?'[saved]':''},state:s,auth:a?{owner:a.owner,at:a.at}:null};}
    if(m.type==='SAVE'){
      const old=await config(),v=m.config??{};const c={...old};
      if(!/^[A-Za-z0-9_]{1,80}$/.test(v.myProfile??''))throw new Error('用户名格式错误');
      for(const k of ['enabled','telegramEnabled','alertPositionChanges','alertKolChanges'])c[k]=!!v[k];
      c.myProfile=v.myProfile;c.pollMinutes=Math.max(.5,Math.min(60,Number(v.pollMinutes)||1));c.tokensPerRun=Math.max(1,Math.min(10,Math.floor(Number(v.tokensPerRun)||3)));
      c.kolMinutes=Math.max(1,Math.min(60,Number(v.kolMinutes)||5));c.activityEnabled=!!v.activityEnabled;
      c.telegramChatId=String(v.telegramChatId??'').trim();if(v.telegramBotToken&&v.telegramBotToken!=='[saved]')c.telegramBotToken=String(v.telegramBotToken).trim();if(v.clearBot)c.telegramBotToken='';
      await chrome.storage.local.set({config:c});if(c.myProfile.toLowerCase()!==old.myProfile.toLowerCase())await save(empty());
      if(!c.telegramEnabled){const s=await read();s.outbox=[];await save(s);}await schedule();return {ok:true};
    }
    if(m.type==='POLL'){await poll(true);return {ok:true};}
    if(m.type==='TEST_TG'){await telegram(await config(),'✅ FOMO Monitor V0.1 Telegram 连接测试');return {ok:true};}
    if(m.type==='CLEAR_AUTH'){await chrome.storage.session.remove('auth');return {ok:true};}
    if(m.type==='RESET'){await save(empty());return {ok:true};}
    if(m.type==='MANUAL_AUTH'){
      const token=String(m.token??'').replace(/^Bearer\s+/,'').trim();if(!/^[A-Za-z0-9_.-]{20,12000}$/.test(token))throw new Error('令牌格式错误');
      const s=await read(),c=await config(),a={authorization:`Bearer ${token}`};const p=await api(`/v2/users/userHandle/${encodeURIComponent(c.myProfile)}`,a,s);await api('/v2/users/current/followingIds',a,s);
      await chrome.storage.session.set({auth:{...a,owner:{id:p.id,handle:p.userHandle,manuallyAsserted:true},at:Date.now()}});return {ok:true};
    }
    throw new Error('未知操作');
  }).then(respond,e=>respond({ok:false,error:errorText(e)}));return true;
});

let floatJob=null;
function openFloat(){if(floatJob)return floatJob;floatJob=(async()=>{const stored=(await chrome.storage.session.get('floatId')).floatId;if(stored){try{await chrome.windows.update(stored,{focused:true});return;}catch{await chrome.storage.session.remove('floatId');}}const pref=(await chrome.storage.local.get('windowSize')).windowSize;const width=Math.max(440,Math.min(1200,Number(pref?.width)||520)),height=Math.max(480,Math.min(1400,Number(pref?.height)||780));let bounds={};try{const host=await chrome.windows.getLastFocused();if(Number.isFinite(host.left)&&Number.isFinite(host.top)&&host.width&&host.height)bounds={left:Math.round(host.left+Math.max(0,(host.width-width)/2)),top:Math.round(host.top+Math.max(0,(host.height-height)/2))};}catch{}const w=await chrome.windows.create({...bounds,url:chrome.runtime.getURL('src/popup.html?floating=1'),type:'popup',width,height});if(w?.id)await chrome.storage.session.set({floatId:w.id});})().finally(()=>{floatJob=null;});return floatJob;}
chrome.windows?.onRemoved?.addListener(async id=>{if((await chrome.storage.session.get('floatId')).floatId===id)await chrome.storage.session.remove('floatId');});

chrome.action?.onClicked?.addListener(()=>openFloat().catch(()=>{}));
