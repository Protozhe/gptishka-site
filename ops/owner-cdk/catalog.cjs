'use strict';
const AISOU='https://aiee.fun',AIBUY='https://aichongzhi.fun';
const POOLS=Object.freeze([
 ...['plus','premium','super','ultra'].map(t=>({id:{plus:'gl',premium:'gp',super:'gs',ultra:'gu'}[t],group:'grok',productKey:`grok-${t}-1`,site:AISOU,supplier:'aisou',title:`Grok ${t[0].toUpperCase()+t.slice(1)} — 1 месяц`})),
 ...[250,500,1000].flatMap(n=>['aisou','aibuy'].map(s=>({id:`c${n}${s==='aisou'?'s':'b'}`,group:'codex',productKey:`codex-${n}`,site:s==='aisou'?AISOU:AIBUY,supplier:s,title:`Codex — ${n} кредитов`}))),
 {id:'claude',group:'claude',productKey:'claude-pro',site:AIBUY,supplier:'aibuy',title:'Claude Pro — 1 месяц'},
]);
function poolBy(id){return POOLS.find(p=>p.id===id)}
function poolFor(product,supplier){return POOLS.find(p=>p.productKey===product&&p.supplier===supplier)}
function parseCodes(text){
 const lines=String(text||'').trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!lines.length||lines.length>20||lines.some(x=>! /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(x)))throw Error('cdk_codes_invalid');
 return [...new Set(lines)];
}
module.exports={POOLS,poolBy,poolFor,parseCodes};
