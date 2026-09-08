import {key} from './core.js';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function normalizeTop(data,token){
 if(!Array.isArray(data))throw new Error('持仓排行响应结构异常');
 const row=data.find(r=>key(r.tokenAddress,r.networkId)===token.key);
 if(!row||!Array.isArray(row.topHolders)||!Number.isInteger(row.totalHolders)||row.totalHolders<0)throw new Error('持仓排行响应不完整');
 const ids=new Set();const holders=row.topHolders.map(h=>{
  if(!h.user?.id||!h.tradeId||ids.has(h.user.id)||!finite(h.humanAmount)||h.humanAmount<0||!finite(h.value)||h.value<0)throw new Error('持仓排行字段异常');ids.add(h.user.id);
  return {id:h.user.id,handle:h.user.userHandle,displayName:h.user.displayName,avatar:h.user.profilePictureLink,tradeId:h.tradeId,value:h.value,quantity:h.humanAmount,avgEntryPrice:finite(h.averageEntryPrice)&&h.averageEntryPrice>0?h.averageEntryPrice:null,unrealizedPnl:finite(h.unrealizedPnl)?h.unrealizedPnl:null,costBasis:finite(h.costBasis)&&h.costBasis>0?h.costBasis:null,state:h.humanAmount>0?'HOLD':'EXIT'};
 });
 return {holders,total:row.totalHolders,complete:holders.length===row.totalHolders,at:Date.now()};
}
export function selectHolders(token,snapshot,filter){
 if(filter==='following')return Object.values(snapshot?.holders??{});
 const holders=(snapshot?.ranking?.holders??[]).filter(h=>h.quantity>0);
 if(filter==='top')return [...holders].sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id)).slice(0,10);
 return holders.filter(h=>h.avgEntryPrice>0&&token.price>0&&token.marketCap>0).sort((a,b)=>a.avgEntryPrice-b.avgEntryPrice||a.id.localeCompare(b.id)).slice(0,10);
}
export function holderMetrics(h,token){
 const quantity=h.trade?.quantity??h.quantity;const avg=h.trade?.avgEntryPrice??h.avgEntryPrice;
 const value=h.trade?(finite(quantity)&&finite(token.price)?quantity*token.price:null):h.value;
 const pnl=h.trade?(finite(value)&&finite(avg)?value-quantity*avg:null):h.unrealizedPnl;
 const pct=quantity===0?0:h.trade?(avg>0&&finite(token.price)?(token.price/avg-1)*100:null):(h.costBasis>0&&finite(pnl)?pnl/h.costBasis*100:null);
 const entryCap=avg>0&&token.price>0&&token.marketCap>0?avg*token.marketCap/token.price:null;
 return {value,pnl,pct,entryCap};
}
