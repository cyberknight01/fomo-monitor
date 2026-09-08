export const DEFAULTS = {kolMinutes:5,activityEnabled:false,marketRules:{},enabled:false,myProfile:'',pollMinutes:1,tokensPerRun:3,telegramEnabled:false,telegramBotToken:'',telegramChatId:'',alertPositionChanges:true,alertKolChanges:true};
export const key = (address, networkId) => `${String(address).startsWith('0x') ? address.toLowerCase() : address}:${networkId}`;
const finite = (n, field) => { if(n === null || n === undefined || !Number.isFinite(Number(n))) throw new Error(`字段异常: ${field}`); return Number(n); };
export function normalizeTrade(t) {
  if (!t?.id || !t.tokenAddress || !Number.isInteger(t.networkId)) throw new Error('成交结构异常');
  const quantity = finite(t.humanTokenAmount, 'humanTokenAmount');
  const buy = finite(t.sumSwapOpen, 'sumSwapOpen'), sell = finite(t.sumSwapClosed, 'sumSwapClosed');
  if (quantity < 0 || buy < 0 || sell < 0) throw new Error('成交数量异常');
  return {avgEntryPrice:Number.isFinite(t.avgEntryPrice)&&t.avgEntryPrice>0?t.avgEntryPrice:null,id:t.id,key:key(t.tokenAddress,t.networkId),quantity,buy,sell,transferIn:finite(t.sumTransferIn,'sumTransferIn'),transferOut:finite(t.sumTransferOut,'sumTransferOut'),closedAt:t.closedAt,createdAt:t.createdAt,updatedAt:t.updatedAt};
}
export function positions(data) {
  if (!Array.isArray(data?.balances)) throw new Error('余额响应缺少 balances 数组');
  const out = [], cash = [];
  for (const item of data.balances) {
    const b = item.balance, f = item.tokenFilterResult, t = f?.token;
    if (!b?.tokenAddress || !t || !Number.isInteger(t.networkId)) throw new Error('余额行缺少代币身份，保留旧快照');
    const quantity = finite(b.shiftedBalance,'shiftedBalance');
    if (quantity < 0) throw new Error('负余额');
    const price = f.priceUSD == null ? null : finite(f.priceUSD,'priceUSD');
    const row = {key:key(b.tokenAddress,t.networkId),address:b.tokenAddress,networkId:t.networkId,symbol:t.symbol || t.name || b.tokenAddress,quantity,marketCap:Number.isFinite(Number(f.marketCap))&&Number(f.marketCap)>0?Number(f.marketCap):null,value:price==null?null:price*quantity,price,trade:item.activeTrade?normalizeTrade(item.activeTrade):null};
    const avg = item.activeTrade?.avgEntryPrice;
    row.pnlPercent = Number.isFinite(avg) && avg > 0 && price != null ? (price/avg-1)*100 : null;
    row.entryMarketCap = Number.isFinite(avg)&&avg>0&&price>0&&row.marketCap ? avg*row.marketCap/price : null;
    row.pnlUsd = Number.isFinite(avg) && price != null ? (price-avg)*quantity : null;
    if (item.valuation?.includeUnrealizedPnl === false) cash.push(row);
    else if (quantity > 0) out.push(row);
  }
  if(new Set(out.map(p=>p.key)).size!==out.length)throw new Error('重复代币余额，需要适配多钱包汇总');
  return {positions:out,cash};
}
export function tradeDiff(previous, current, {baselineAt=0, allowNew=false}={}) {
  if (!current) return {state:'UNKNOWN',actions:[]};
  const epsilon = Math.max(1e-10, Math.abs(current.quantity)*1e-10);
  const gt = (a,b) => a-b > epsilon;
  if (!previous || previous.id !== current.id) {
    const isNew = allowNew && Date.parse(current.createdAt)>baselineAt && current.buy>epsilon;
    return {state:current.closedAt?'EXIT':current.quantity>epsilon?'HOLD':'UNKNOWN',actions:isNew?['BUY',...(current.sell>epsilon?[current.closedAt?'EXIT':'SELL']:[])]:[]};
  }
  if (current.buy+epsilon<previous.buy || current.sell+epsilon<previous.sell) return {state:'UNKNOWN',actions:[],reason:'累计成交量回退'};
  const actions=[];
  if(gt(current.buy,previous.buy))actions.push(previous.quantity>epsilon?'ADD':'BUY');
  if(gt(current.sell,previous.sell))actions.push(current.closedAt && current.quantity<=epsilon?'EXIT':'SELL');
  const transfer = gt(current.transferIn,previous.transferIn)||gt(current.transferOut,previous.transferOut);
  const unexplained = Math.abs(current.quantity-previous.quantity)>epsilon && !actions.length;
  return {state:actions.at(-1) || (transfer||unexplained?'UNKNOWN':current.quantity>epsilon?'HOLD':current.closedAt?'EXIT':'UNKNOWN'),actions,reason:transfer?'同时存在转账':unexplained?'数量变化尚无成交确认':null};
}
export function validateFriends(data, token) {
  if(!Array.isArray(data?.tokens))throw new Error('关注者响应缺少 tokens');
  const row=data.tokens.find(t=>key(t.tokenAddress,t.networkId)===token.key);
  if(!row || !Array.isArray(row.topHolders) || !Number.isInteger(row.totalHolders) || row.totalHolders<0)throw new Error('关注者持仓响应不完整');
  if(row.topHolders.some(h=>!h.user?.id || !h.tradeId))throw new Error('关注者缺少用户或成交 ID');
  return {...row,complete:row.topHolders.length===row.totalHolders};
}
export function unwrap(json,status=200) {
  if(status===401 || status===403 || ([430,431].includes(status) && json?.error==='unauthorized'))throw new Error('AUTH_REQUIRED');
  if(status===429)throw new Error('RATE_LIMIT');
  if(status<200 || status>=300 || json?.success!==true || json.responseObject==null)throw new Error(`API_RESPONSE_${status}`);
  return json.responseObject;
}

export const tokenAlertsEnabled=(c,k)=>c.tokenAlerts?.[k]??c.tokenAlertsDefault??(c.marketRules?.[k]?.enabled!==false);
