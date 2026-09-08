import {countdown} from './countdown.js';
import {$,send,el,time,money,tokenCards,action,support} from './ui.js';
let latestView;function tick(){if(!latestView)return;const v=countdown(latestView.config,latestView.state,latestView.schedule,!!latestView.auth);$('marketClock').textContent=v.market;$('kolClock').textContent=v.kol;}
async function render(){const view=await send('GET');latestView=view;const {state:s,config:c,auth}=view;tick();$('status').textContent=`${c.enabled?'自动监控开启':'自动监控暂停'}\n${s.status}${!auth?'\n未同步登录会话':''}`;$('time').textContent=`我的持仓更新：${time(s.own?.at)}`;$('metrics').replaceChildren();const ps=s.own?.positions??[];const known=ps.filter(p=>Number.isFinite(p.value));const total=known.reduce((n,p)=>n+p.value,0);$('portfolio').textContent=s.own?money(total)+' USD':'—';$('portfolioNote').textContent=known.length!==ps.length?'部分持仓估值缺失 · 未包含现金余额':'当前非现金持仓总价值';for(const [label,value] of [['持仓',ps.length],['关注',s.followingCount??'—'],['待发送',s.outbox.length]]){const d=el('div',label);d.append(el('strong',String(value),'notranslate'));$('metrics').append(d);}tokenCards(s);}
$('settings').onclick=()=>chrome.runtime.openOptionsPage();$('poll').onclick=()=>action($('poll'),async()=>{await send('POLL');await render();});render().catch(e=>$('message').textContent=e.message);
let refreshTimer;chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.state||changes.config)){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>render().catch(()=>{}),180);}});
let sizeTimer;window.addEventListener('resize',()=>{clearTimeout(sizeTimer);sizeTimer=setTimeout(async()=>{try{const w=await chrome.windows.getCurrent();await chrome.storage.local.set({windowSize:{width:w.width,height:w.height}});}catch{}},400);});
support();

setInterval(tick,1000);setInterval(()=>{if(!document.hidden)send('GET').then(v=>{latestView=v;tick();}).catch(()=>{});},10000);
