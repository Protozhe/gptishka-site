'use strict';
// Retire public offers only. Never delete products, keys or historical orders.
const {slugs:MONTHLY}=require('./grok-catalog.cjs');
const RETIRED=Object.freeze(['supergrok','supergrok-2','supergrok-3','supergrok-heavy']);
const PAGE={title:'Grok',titleEn:'Grok',heroTitle:'Grok',constructorTitle:'Grok',
 heroDescription:'Grok Plus, Premium, Super и Ultra на 1 месяц. Выберите тариф и подключите подписку на свой аккаунт после оплаты.',
 constructorDescription:'Все тарифы доступны на 1 месяц. Для подключения нужен аккаунт Grok без действующей платной подписки; после оплаты укажите sso в форме активации.'};
const CARD={title:'Grok',planSummary:'Plus · Premium · Super · Ultra',imageAlt:'Grok',hoverImageAlt:'Grok'};
const selectFields=(row,fields)=>Object.fromEntries(fields.map(k=>[k,row[k]]));
async function snapshot(db){
 const page=await db.servicePage.findUnique({where:{slug:'supergrok'}});
 if(!page||page.serviceKey!=='grok'||!page.isActive)throw Error('grok_page_contract_changed');
 const products=await db.product.findMany({where:{slug:{in:[...RETIRED,...MONTHLY]}}});
 for(const slug of MONTHLY){const p=products.find(x=>x.slug===slug);if(!p?.isActive||p.isArchived||!p.tags.includes('month:1'))throw Error('grok_monthly_product_missing');}
 const ids=products.filter(p=>RETIRED.includes(p.slug)).map(p=>p.id);
 return {
  products:products.filter(p=>RETIRED.includes(p.slug)).map(p=>selectFields(p,['id','slug','isActive'])),
  placements:await db.servicePageProductPlacement.findMany({where:{productId:{in:ids}}}),
  showcasePlacements:await db.productShowcasePlacement.findMany({where:{productId:{in:ids}}}),
  page:{id:page.id,...selectFields(page,Object.keys(PAGE))},
  cards:(await db.productShowcaseServiceCard.findMany({where:{serviceKey:'grok'}})).map(c=>({id:c.id,...selectFields(c,Object.keys(CARD))})),
 };
}
async function retire(db,{apply=false,backup}={}){
 const before=await snapshot(db),ids=before.products.map(p=>p.id);
 if(!apply)return {dryRun:true,retire:before.products.map(p=>p.slug),keep:MONTHLY,durationMonths:1};
 if(typeof backup!=='function')throw Error('catalog_backup_required');
 await backup(before);
 await db.$transaction(async tx=>{
  await tx.product.updateMany({where:{id:{in:ids},slug:{in:RETIRED}},data:{isActive:false}});
  await tx.servicePageProductPlacement.updateMany({where:{productId:{in:ids}},data:{isActive:false}});
  await tx.productShowcasePlacement.updateMany({where:{productId:{in:ids}},data:{isActive:false}});
  await tx.servicePage.update({where:{id:before.page.id},data:PAGE});
  await tx.productShowcaseServiceCard.updateMany({where:{serviceKey:'grok'},data:CARD});
 });
 return {applied:true,retired:before.products.map(p=>p.slug),keep:MONTHLY,durationMonths:1};
}
async function rollback(db,before){
 // Restore only the fields this operation owns; leave newer prices and orders alone.
 if(!before?.page?.id||before.products.some(p=>!RETIRED.includes(p.slug)))throw Error('catalog_backup_invalid');
 await db.$transaction(async tx=>{
  for(const p of before.products)await tx.product.update({where:{id:p.id},data:{isActive:p.isActive}});
  for(const p of before.placements)await tx.servicePageProductPlacement.update({where:{id:p.id},data:{isActive:p.isActive}});
  for(const p of before.showcasePlacements)await tx.productShowcasePlacement.update({where:{id:p.id},data:{isActive:p.isActive}});
  await tx.servicePage.update({where:{id:before.page.id},data:selectFields(before.page,Object.keys(PAGE))});
  for(const c of before.cards)await tx.productShowcaseServiceCard.update({where:{id:c.id},data:selectFields(c,Object.keys(CARD))});
 });
 return {rolledBack:true};
}
module.exports={RETIRED,MONTHLY,retire,rollback};
