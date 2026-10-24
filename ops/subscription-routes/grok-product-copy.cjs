'use strict';
// Offer copy checked against AISOU items 14/81/82/83 on 2026-10-24.
// Item 33 is the legacy iOS offer and is deliberately outside this catalog.
const TIERS={
 plus:{name:'Grok Plus',ru:['Диалоги с ИИ, помощь с текстами, анализ информации и творческие задачи.','Базовый общий лимит для возможностей Grok и Cursor; базовые преимущества X.','Grok Bot в этот тариф не входит.'],en:['AI conversations, writing assistance, information analysis and creative tasks.','Base shared allowance for Grok and Cursor features, with basic X benefits.','Grok Bot is not included.']},
 premium:{name:'Grok Premium',ru:['Возможности Plus, Grok Bot и расширенные преимущества X.','Общий лимит — ориентировочно в 4 раза выше Plus.','Новые модели, облачные агенты, автоматизация и инструменты работы с кодом в рамках тарифа.'],en:['Plus features, Grok Bot and expanded X benefits.','Shared allowance approximately 4 times the Plus level.','New models, cloud agents, automation and coding tools within the plan.']},
 super:{name:'Grok Super',ru:['Возможности Premium, включая Grok Bot, Cursor и преимущества X.','Общий лимит — ориентировочно в 15 раз выше Plus.','Генерация видео до 1080p, приоритет в часы пик и более быстрые ответы в рамках тарифа.'],en:['Premium features, including Grok Bot, Cursor and X benefits.','Shared allowance approximately 15 times the Plus level.','Video generation up to 1080p, priority at peak times and faster responses within the plan.']},
 ultra:{name:'Grok Ultra',ru:['Возможности Super и наибольший общий лимит среди этих четырёх тарифов.','Общий лимит — ориентировочно в 50 раз выше Plus.','Доступ к старшим моделям чата, приоритет новым функциям и максимальная скорость в рамках тарифа.'],en:['Super features and the largest shared allowance among these four plans.','Shared allowance approximately 50 times the Plus level.','Access to higher-tier chat models, priority for new features and the fastest responses within the plan.']},
};
const FIELDS=['description','descriptionEn','modalDescription','modalDescriptionEn'];
function copyFor(tier){
 const p=TIERS[tier];if(!p)throw Error('grok_copy_tier_invalid');
 return {
  description:['Подключение '+p.name+' на ваш аккаунт.',...p.ru,'Только Free: без действующей платной подписки.','Срок: 1 месяц','Возможности и лимиты зависят от тарифа и доступности в вашем аккаунте.'].join('\n'),
  descriptionEn:['Activate '+p.name+' on your own account.',...p.en,'Free accounts only, with no active paid subscription.','Duration: 1 month','Features and allowances depend on the plan and availability on your account.'].join('\n'),
  modalDescription:p.ru.join(' ')+' Подключаем подписку на 1 месяц к вашему аккаунту Free без действующей платной подписки. Фактические возможности и лимиты указаны в вашем аккаунте.',
  modalDescriptionEn:p.en.join(' ')+' We activate a one-month subscription on your Free account with no active paid plan. Check your account for actual features and allowances.',
 };
}
async function snapshot(db){
 const products=await db.product.findMany({where:{slug:{in:Object.keys(TIERS).map(t=>'grok-'+t+'-1')}},include:{visualConfig:true}});
 if(products.length!==4||products.some(p=>!p.isActive||p.isArchived||!p.tags.includes('month:1')))throw Error('grok_monthly_product_missing');
 return products.map(p=>({id:p.id,slug:p.slug,...Object.fromEntries(FIELDS.map(k=>[k,p[k]])),visual:p.visualConfig?{id:p.visualConfig.id,cardDescription:p.visualConfig.cardDescription}:null}));
}
async function updateCopy(db,{apply=false,backup}={}){
 const before=await snapshot(db);
 if(!apply)return {dryRun:true,products:before.map(p=>p.slug),durationMonths:1};
 if(typeof backup!=='function')throw Error('catalog_backup_required');
 await backup(before);
 await db.$transaction(async tx=>{for(const p of before){
  const next=copyFor(p.slug.split('-')[1]);
  await tx.product.update({where:{id:p.id},data:next});
  if(p.visual)await tx.productVisualConfig.update({where:{id:p.visual.id},data:{cardDescription:next.description}});
 }});
 return {applied:true,products:before.map(p=>p.slug),durationMonths:1};
}
async function rollbackCopy(db,before){
 if(!Array.isArray(before)||before.length!==4||before.some(p=>!/^grok-(plus|premium|super|ultra)-1$/.test(p.slug)))throw Error('catalog_backup_invalid');
 await db.$transaction(async tx=>{for(const p of before){
  await tx.product.update({where:{id:p.id},data:Object.fromEntries(FIELDS.map(k=>[k,p[k]]))});
  if(p.visual)await tx.productVisualConfig.update({where:{id:p.visual.id},data:{cardDescription:p.visual.cardDescription}});
 }});
 return {rolledBack:true};
}
module.exports={copyFor,updateCopy,rollbackCopy};
