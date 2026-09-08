const valid=n=>typeof n==='number'&&Number.isFinite(n);
const number=n=>valid(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:6}):'待确认';
const usd=n=>valid(n)?'$'+n.toLocaleString('zh-CN',{maximumFractionDigits:2}):'待确认';
const time=n=>n&&Number.isFinite(new Date(n).getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(n))+'（北京时间）':'待确认';
const names={BUY:'首次买入',ADD:'加仓',SELL:'减仓卖出',EXIT:'清仓',HOLD:'继续持有'};
export function formatAlert(e){
 const identity=String(e.tokenKey??'').split(':');
 const footer=`\n\n检测时间：${time(e.at)}\n合约：${identity[0]||'待确认'}\n链 ID：${identity[1]||'待确认'}`;
 if(e.type==='MARKET_CAP')return `${e.direction==='down'?'🔻 下跌阈值提醒':'📈 上涨阈值提醒'}\n代币：${e.symbol}\n\n触发档位：${e.multiple}×（基准的 ${number(e.multiple*100)}%）\n基准市值：${usd(e.base)}\n目标市值：${usd(e.target)}\n检测市值：${usd(e.marketCap)}\n\n该方向此档已提醒，不重复推送。${footer}`;
 const buying=['BUY','ADD'].includes(e.type);
 const avgCap=valid(e.avgEntryPrice)&&valid(e.marketCap)&&valid(e.price)&&e.price>0?e.avgEntryPrice*e.marketCap/e.price:null;
 const fills=e.fills??[];
 if(!e.mine){
  const cap=n=>!valid(n)?'待确认':n>=1e8?'$'+number(Math.round(n/1e6)/100)+'亿':n>=1e4?'$'+number(Math.round(n/100)/100)+'万':usd(n);
  const stamp=n=>time(n).replace('（北京时间）','');
  const side=buying?'🟢 买入':'🔴 卖出';
  const rows=fills.length?fills.slice(0,5).map(f=>`${e.symbol} ｜ ${side} ｜ ${usd(f.usdAmount)} ｜ ${cap(f.marketCap)} ｜ ${stamp(f.at)}`):[`${e.symbol} ｜ ${side} ｜ 待确认 ｜ 待确认 ｜ 时间待确认`];
  return `👤 KOL @${e.handle??'待确认'} · ${names[e.type]??'持仓变化'}\n\n代币 ｜ 操作 ｜ 金额 ｜ 成交市值 ｜ 时间\n${rows.join('\n')}\n\n本轮${buying?'买入':'卖出'}数量：${number(e.delta)} ${e.symbol}\n当前持仓：${number(e.quantity)} ${e.symbol}\n平均建仓市值（估算）：${usd(avgCap)}\n${fills.length?'以上为匹配成交样本，可能不完整。':'暂无匹配成交明细；金额与成交市值待确认。'}\n检测：${stamp(e.at)}（北京时间）\n合约：${identity[0]||'待确认'} · 链 ${identity[1]||'待确认'}${e.reason?'\n备注：'+e.reason:''}`;
 }

 let detail=fills.length?'\n\n本轮匹配的成交样本：'+fills.slice(0,5).map((f,i)=>`\n${i+1}. ${time(f.at)}\n   成交市值 ${usd(f.marketCap)} · 金额 ${usd(f.usdAmount)}`).join('')+'\n样本可能不完整，不能视为本轮全部成交。':'\n成交市值／金额：待确认（暂无匹配成交明细）';
 return `${e.type==='EXIT'?'🚪':buying?'🟢':'🟠'} ${e.mine?'我的持仓':'关注的 KOL'} · ${names[e.type]??'持仓变化'}\n代币：${e.symbol}\n账户：@${e.handle??'待确认'}\n\n操作：${names[e.type]??'持仓变化'}\n本轮${buying?'买入':'卖出'}数量：${number(e.delta)} ${e.symbol}\n当前持仓：${number(e.quantity)} ${e.symbol}\n检测时市值：${usd(e.marketCap)}\n平均买入价：${usd(e.avgEntryPrice)}\n平均建仓市值（估算）：${usd(avgCap)}\n估算依据：平均买入价 × 当前隐含供应量${detail}\n\n成交记录更新时间：${time(e.updatedAt)}\n本轮为轮询期间累计变化，非逐笔通知。${e.reason?'\n备注：'+e.reason:''}${footer}`;
}
export function enrichEvents(state,items,tokenKey,knownIds){
 for(const e of state.events){if(knownIds.has(e.id)||e.tokenKey!==tokenKey||e.type==='MARKET_CAP')continue;
 const type=['BUY','ADD'].includes(e.type)?'swap_buy':'swap_sell';
 const seen=new Set();e.fills=items.filter(f=>f.id&&!seen.has(f.id)&&seen.add(f.id)&&f.tradeId===e.tradeId&&f.userId===e.userId&&f.type===type&&Date.parse(f.createdAt)>e.windowStart&&Date.parse(f.createdAt)<=e.at).map(f=>({at:f.createdAt,marketCap:valid(f.marketCap)?f.marketCap:null,usdAmount:valid(f.usdAmount)?f.usdAmount:null}));
 for(const item of state.outbox)if(item.event.id===e.id)item.event=e;
 }
}

// Telegram entities use UTF-16 offsets, matching JavaScript string lengths.
export function buildAlertMessage(e){
 const style={BUY:['🟢','首次买入'],ADD:['🟩','加仓'],SELL:['🟠','减仓'],EXIT:['🔴','清仓'],MARKET_CAP:e.direction==='down'?['🔻','下跌阈值']:['📈','上涨阈值']};
 const [icon,label]=style[e.type]??['🔔','持仓变化'];const symbol=Array.from(String(e.symbol??'')).slice(0,80).join('');
 const title=`${icon} ${label} · ${symbol}`;let text=(title+'\n━━━━━━━━━━━━━━\n'+formatAlert(e)).slice(0,3900);
 if(/[\uD800-\uDBFF]$/.test(text))text=text.slice(0,-1);
 return {text,entities:[{type:'bold',offset:0,length:title.length}]};
}
