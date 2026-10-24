'use strict';
// Exact, additive rows only. This module never initializes a database or buys a key.
const PLANS=Object.freeze([
  {tier:'plus',price:1012,supplierItem:14},
  {tier:'premium',price:4587,supplierItem:81},
  {tier:'super',price:15313,supplierItem:82},
  {tier:'ultra',price:30635,supplierItem:83},
]);
const slugs=PLANS.map(x=>'grok-'+x.tier+'-1');
const data=plan=>{
  const name='Grok '+plan.tier[0].toUpperCase()+plan.tier.slice(1);
  return {slug:'grok-'+plan.tier+'-1',title:name+' — 1 месяц',titleEn:name+' — 1 month',
    description:'Подписка на ваш аккаунт Grok без действующего платного тарифа.\nАктивация по sso после оплаты.\nСрок: 1 месяц',
    descriptionEn:'A subscription for your Grok account with no active paid plan.\nActivate using sso after payment.\nDuration: 1 month',
    modalDescription:'Нужен аккаунт Grok без действующей подписки. После оплаты потребуется только sso с grok.com.',
    modalDescriptionEn:'Requires a Grok account without an active subscription. Only the sso value from grok.com is required after payment.',
    price:plan.price,currency:'RUB',category:'Подписки ИИ',isActive:true,isArchived:false,stock:null,
    tags:['grok','month:1','activation','grok-sso','align:title:center','align:description:center','align:price:center','align:duration:center','align:features:center','align:meta:center'],
    activationVariants:{withoutLogin:{enabled:true,price:plan.price,deliveryType:'activation',activationSiteUrl:'https://aiee.fun'},withLogin:{enabled:false,price:plan.price,deliveryType:'manual_login',activationSiteUrl:''}},
  };
};
async function snapshot(db){
  const page=await db.servicePage.findUnique({where:{slug:'supergrok'},include:{placements:true}});
  if(!page||page.serviceKey!=='grok'||!page.isActive) throw Error('grok_page_contract_changed');
  return {page,products:await db.product.findMany({where:{slug:{in:slugs}},include:{visualConfig:true}}),cards:await db.productShowcaseServiceCard.findMany()};
}
async function install(db,{apply=false,backup}={}) {
  const before=await snapshot(db);
  const diff=PLANS.filter(p=>!before.products.some(x=>x.slug==='grok-'+p.tier+'-1'));
  for(const p of before.products){const wanted=data(PLANS.find(x=>p.slug==='grok-'+x.tier+'-1'));
    const same=(a,b)=>JSON.stringify(a,Object.keys(a).sort())===JSON.stringify(b,Object.keys(b).sort());
    if(p.title!==wanted.title||Number(p.price)!==wanted.price||p.currency!=='RUB'||!p.activationVariants||!same(p.activationVariants.withoutLogin,wanted.activationVariants.withoutLogin)||!same(p.activationVariants.withLogin,wanted.activationVariants.withLogin))throw Error('grok_existing_row_conflict');}
  if(!apply)return {dryRun:true,newSlugs:diff.map(p=>'grok-'+p.tier+'-1'),prices:PLANS.map(p=>({tier:p.tier,rub:p.price})),before};
  if(typeof backup!=='function')throw Error('catalog_backup_required');
  await backup(before);
  await db.$transaction(async tx=>{
    const max=Math.max(0,...before.page.placements.map(p=>p.sortOrder));
    for(const [i,p] of PLANS.entries()) {
      const expected=data(p),product=await tx.product.upsert({where:{slug:expected.slug},update:{},create:expected});
      await tx.productVisualConfig.upsert({where:{productId:product.id},update:{},create:{productId:product.id,cardTitle:expected.title,cardDescription:expected.description,imageUrl:'/assets/img/services/grok-card.webp',imageAlt:expected.title,hoverImageUrl:'/assets/img/services/grok-card-hover.webp',hoverImageAlt:expected.title,backgroundType:'solid',backgroundColor:'#111111',buttonText:'Выбрать тариф',buttonStyle:'primary',isVisible:true}});
      await tx.servicePageProductPlacement.upsert({where:{servicePageId_productId:{servicePageId:before.page.id,productId:product.id}},update:{},create:{servicePageId:before.page.id,productId:product.id,sortOrder:max+(i+1)*10,isActive:true,isPinned:false}});
    }
  });
  return {applied:true,slugs,prices:PLANS.map(p=>({tier:p.tier,rub:p.price}))};
}
module.exports={PLANS,slugs,data,snapshot,install};
