import {selectHolders,holderMetrics} from './rankings.js';
import {initLanguage,translate} from './i18n.js';
export const $=id=>document.getElementById(id);
export const send=async(type,extra={})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(r?.ok===false)throw new Error(r.error);return r;};
export const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
export const time=t=>t?new Date(t).toLocaleString('zh-CN',{hour12:false}):'尚未更新';
export const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'待确认';
export const compact=n=>Number.isFinite(n)?'$'+new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(n):'待确认';
export const amount=n=>Number.isFinite(n)?String(n):'—';
export const statusName=s=>({BUY:'买入',ADD:'加仓',SELL:'减仓',EXIT:'清仓',HOLD:'持有',UNKNOWN:'待确认'}[s]??'待确认');
const opened=new Set(),historyOpened=new Set(),filters=new Map();
const tone=n=>Number.isFinite(n)?n>=0?'profit':'loss':'muted';
function tint(key){let n=0;for(const c of key)n=(n*31+c.charCodeAt(0))>>>0;return n%6;}
function historyFor(state,token,holder){return state.events.filter(e=>!e.mine&&e.tokenKey===token.key&&e.userId===holder.id&&e.type!=='MARKET_CAP').slice(-8).reverse();}
function holderRow(h,p,s,filter){
 const container=el('div',null,'holder-container');const row=el('div',null,'holder');const avatar=el('span',(h.handle??'?').slice(0,1).toUpperCase(),'avatar notranslate');
 try{const u=new URL(h.avatar);if(u.protocol==='https:'){const img=el('img');img.src=u.href;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();avatar.append(img);}}catch{}
 const name=el('div',null,'holder-name');const profile=el(h.handle?'a':'strong',h.displayName||h.handle||'—','profile-link notranslate');if(h.handle){profile.href='https://fomo.family/profile/'+encodeURIComponent(h.handle);profile.target='_blank';profile.rel='noopener noreferrer';}name.append(profile,el('small','@'+(h.handle??'—'),'notranslate'));
 const ai=el('button','AI','ai-button');ai.disabled=true;ai.title='投资逻辑 AI 分析将在后续版本开放。';ai.setAttribute('aria-label','AI 分析（即将推出）');
 const m=holderMetrics(h,p),stats=el('div',null,'align-right holder-stats');stats.append(el('small','持仓金额','stat-label'),el('strong',money(m.value),'notranslate'));
 const pnl=el('small',null,tone(m.pnl));pnl.append(el('span','未实现盈亏 '),el('span',m.pnl==null?'—':money(m.pnl)+(m.pct==null?'':` (${m.pct>=0?'+':''}${m.pct.toFixed(1)}%)`),'notranslate'));stats.append(pnl,el('small',h.uncertain?'待确认':statusName(h.state)));
 row.append(avatar,name,ai,stats);container.append(row);
 const entry=el('div',null,'entry-cap');entry.append(el('span','平均建仓市值（估算）'),el('strong',compact(m.entryCap),'notranslate'));container.append(entry);
 const history=el('details',null,'history');const historyKey=p.key+'|'+h.id;history.open=historyOpened.has(historyKey);history.ontoggle=()=>{if(history.isConnected)history.open?historyOpened.add(historyKey):historyOpened.delete(historyKey);};const events=historyFor(s,p,h);history.append(el('summary','操作记录'+` (${events.length})`));
 if(!events.length)history.append(el('small','暂无已记录操作','muted'));
 for(const e of events){const buying=['BUY','ADD'].includes(e.type),line=el('div',null,'history-line '+(buying?'trade-buy':'trade-sell'));const action=el('strong',(buying?'买入 ':'卖出 ')+statusName(e.type));const fills=e.fills??[];const known=fills.filter(f=>Number.isFinite(f.usdAmount));const usd=known.length?known.reduce((n,f)=>n+f.usdAmount,0):null;const mc=known.find(f=>Number.isFinite(f.marketCap))?.marketCap;line.append(action,el('span',usd==null?'金额待确认':money(usd),'trade-amount notranslate'),el('span',Number.isFinite(mc)?'MC '+compact(mc):'MC 待确认','trade-cap notranslate'),el('small',time(e.at),'notranslate'));history.append(line);}
 history.append(el('small','仅显示本插件已记录的变化，不代表完整历史。','muted'));container.append(history);return container;
}
export function tokenCards(s){
 const root=$('tokens');if(!root)return;root.replaceChildren();if(!s.own){root.append(el('p','先到设置页输入 FOMO 名称并同步持仓。','muted'));return;}if(!s.own.positions.length){root.append(el('p','当前没有非现金持仓。','muted'));return;}
 for(const p of s.own.positions){
 const card=el('details',null,'token-card tint-'+tint(p.key));card.open=opened.has(p.key);card.ontoggle=()=>{if(card.isConnected)card.open?opened.add(p.key):opened.delete(p.key);};
 const head=el('summary',null,'tokenhead');const left=el('div');left.append(el('strong',p.symbol,'notranslate'));const cap=el('small');cap.append(el('span','市值 '),el('span',compact(p.marketCap),'notranslate'));left.append(cap);
 const right=el('div',null,'align-right');right.append(el('small','持仓金额','stat-label'),el('strong',money(p.value),'notranslate'));const pnl=el('small',null,tone(p.pnlPercent));pnl.append(el('span','未实现盈亏 '),el('span',p.pnlPercent==null?'—':`${p.pnlPercent>=0?'+':''}${p.pnlPercent.toFixed(2)}%`,'notranslate'));right.append(pnl);head.append(left,right,el('span','⌄','chevron'));card.append(head);
 const body=el('div',null,'token-body');body.append(el('p',`我的盈亏 ${money(p.pnlUsd)} · ${p.uncertain?'待确认':statusName(p.state)}`,tone(p.pnlUsd)));
 const filter=filters.get(p.key)??'following',k=s.tokens[p.key];const nav=el('div',null,'filters');nav.setAttribute('role','group');for(const [id,label] of [['top','前10大持仓'],['low','最低买入市值10人'],['following','我关注的KOL']]){const count=id==='following'?Object.keys(k?.holders??{}).length:k?.ranking?selectHolders(p,k,id).length:'—';const b=el('button',label+' ('+count+')',filter===id?'active':'');b.setAttribute('aria-pressed',String(filter===id));b.onclick=()=>{filters.set(p.key,id);opened.add(p.key);tokenCards(s);};nav.append(b);}body.append(nav);
 if(filter==='following')body.append(el('small',`关注者 ${k?.total??'—'} 人 · ${time(k?.at)}`));
 else{body.append(el('small',`FOMO ${k?.ranking?.holders.length??0} / ${k?.ranking?.total??'—'} · ${time(k?.ranking?.at)}`,'notranslate'));body.append(el('p',filter==='low'?'仅对接口已返回的持仓者样本排序，非全体最低买入排名。':'接口返回的持仓排行，不代表链上全部钱包。','scope-note'));if(filter==='low')body.append(el('small','排序依据为估算建仓市值；缺失买入价的记录不参与。','muted'));}
 const at=filter==='following'?k?.at:k?.ranking?.at;const error=filter==='following'?k?.error:k?.rankingError;
 if(!at||error||Date.now()-at>600000)body.append(el('p',error?(filter==='following'?'关注者详情暂不可用。':'持仓排行暂不可用。'):!at?'等待更新':'数据较旧，请检查刷新状态','warn'));
 if(filter==='following'&&k&&!k.complete)body.append(el('p','关注者列表不完整','warn'));
 const holders=selectHolders(p,k,filter);for(const h of holders)body.append(holderRow(h,p,s,filter));if(!holders.length)body.append(el('p','当前筛选没有有效记录。','muted'));
 body.append(el('small','盈亏为平均买入价口径的未实现估算；不含已实现盈亏。','muted'));body.append(el('p',p.key,'mono contract notranslate'));card.append(body);root.append(card);
 }
}
export async function action(button,fn){button.disabled=true;$('message').textContent='处理中…';try{await fn();$('message').textContent='已完成';}catch(e){$('message').textContent=e.message;}finally{button.disabled=false;}}
export function support(){const b=el('button','♥','icon-button heart');b.title='支持作者';b.setAttribute('aria-label','支持作者');document.querySelector('header').append(b);const d=el('dialog',null,'support');d.append(el('h2','♥ 支持作者'),el('p','如果这个工具对你有帮助，欢迎自愿支持后续维护与改进。'));
 for(const [label,address] of [['Robinhood & BSC','0x63Ba395C6BFa6618aaBe579cc5894752acfaE0A6'],['Solana','84fpASXqJgAd8vTJ2FX3yL61kgf6zN8PJqwGu7xMUs5j']]){const block=el('section');block.append(el('strong',label,'notranslate'),el('p',address,'mono notranslate'));const copy=el('button','复制地址');copy.onclick=async()=>{try{await navigator.clipboard.writeText(address);copy.textContent='✅ 已复制';copy.classList.add('copied');}catch{copy.textContent='请选中地址复制';}};block.append(copy);d.append(block);}
 d.append(el('small','支持完全自愿，不影响任何功能。转账前请核对网络与地址。'));const close=el('button','关闭');close.onclick=()=>d.close();d.append(close);b.onclick=()=>d.showModal();document.body.append(d);initLanguage().catch(e=>{$('message').textContent=e.message;});
}
