'use strict';
// Run as root inside the deployed release. No credentials leave this process.
const fs=require('fs'),cp=require('child_process'),path=require('path');
const root=fs.realpathSync(path.join(__dirname,'../..'));
const app=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(x=>x.name==='gptishka-admin-api');
if(!app?.pid)throw Error('website_not_running');
for(const v of fs.readFileSync('/proc/'+app.pid+'/environ','utf8').split('\0')){const i=v.indexOf('=');if(i>0)process.env[v.slice(0,i)]=v.slice(i+1)}
for(const k of ['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE','NODE_UNIQUE_ID'])delete process.env[k];
require(root+'/apps/admin-backend/dist/config/env.js');
const {PrismaClient}=require(root+'/node_modules/@prisma/client'),db=new PrismaClient();
const {install,slugs}=require('./grok-catalog.cjs');
async function main(){
 const mode=process.argv[2],backup=process.argv[3];
 if(mode==='inspect'){
   const r=await install(db);const products=await db.product.findMany({where:{slug:{in:['claude-5x-max','claude-20x-max']}},select:{id:true,slug:true,isActive:true}});
   if(products.length!==2||products.some(p=>!p.isActive))throw Error('claude_products_missing');
   return {newSlugs:r.newSlugs,prices:r.prices,claudeProducts:products};
 }
 if(!path.isAbsolute(backup)||!backup.startsWith('/var/lib/gptishka-runtime/subscription-backups/'))throw Error('backup_path_invalid');
 if(mode==='apply')return install(db,{apply:true,backup:async data=>{if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify(data),{mode:0o600,flag:'wx'})}});
 if(mode==='rollback'){
   const old=JSON.parse(fs.readFileSync(backup,'utf8')),original=new Set(old.products.map(p=>p.slug));
   const added=await db.product.findMany({where:{slug:{in:slugs.filter(s=>!original.has(s))}}});
   if(await db.orderItem.count({where:{productId:{in:added.map(p=>p.id)}}}))throw Error('rollback_has_new_orders_archive_manually');
   await db.$transaction(async tx=>{for(const p of added){await tx.servicePageProductPlacement.deleteMany({where:{productId:p.id,servicePageId:old.page.id}});await tx.productVisualConfig.deleteMany({where:{productId:p.id}});await tx.product.delete({where:{id:p.id}})}});
   return {rolledBack:added.map(p=>p.slug)};
 }
 throw Error('mode_invalid');
}
main().then(d=>console.log(JSON.stringify(d))).catch(e=>{console.log(JSON.stringify({error:/^[a-z_]+$/.test(e.message)?e.message:'catalog_operation_failed'}));process.exitCode=1}).finally(()=>db.$disconnect());
