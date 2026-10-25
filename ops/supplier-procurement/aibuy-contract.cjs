'use strict';
// Code 0 is a subscription contract in the existing INTEGER ledger, never a
// credit denomination. Keeping its schema avoids unsafe rollback migrations.
function contract(product){
 if(product==='claude-pro')return {code:0,item:29,race:'',ceiling:13400,workflow:'claude_pro',provider:'claude'};
 const n=Number(String(product||'').match(/^codex-(250|500|1000)$/)?.[1]);
 return n?{code:n,item:75,race:n+'点数额度',ceiling:({250:7500,500:14500,1000:27600})[n],workflow:'codex_'+n,provider:'gpt'}:null;
}
function cutoff(p,product){return product==='claude-pro'?p?.productEnabledAfter?.[product]:p?.enabledAfter}
function settingsForProduct(settings,p,product){
 const start=cutoff(p,product);
 if(!contract(product)||!Number.isFinite(Date.parse(start)))throw Error('supplier_product_disabled');
 return {...settings.policy,products:[...new Set([...(settings.policy.products||[]),product])],enabledAfter:start,productEnabledAfter:{}};
}
module.exports={contract,cutoff,settingsForProduct};
