'use strict';
const crypto=require('node:crypto');
const {poolBy,parseCodes}=require('./catalog.cjs');
async function importOwnerKeys(input,{prisma,licenseService}){
 if(!input||!/^tgcdk-[a-f0-9]{32}$/.test(input.reference||'')||typeof input.userId!=='string')throw Error('supplier_cdk_request_invalid');
 const pool=poolBy(input.pool);if(!pool||!Array.isArray(input.codes))throw Error('supplier_cdk_request_invalid');
 const codes=parseCodes(input.codes.join('\n'));
 const owner=await prisma.user.findUnique({where:{id:input.userId},select:{isActive:true,role:{select:{code:true}}}});
 if(owner?.isActive!==true||owner.role?.code!=='OWNER')throw Error('supplier_owner_required');
 // Raw CDKs stay in the existing licensed inventory. Receipts contain only a
 // bounded request fingerprint and counts; they never relabel an existing key.
 const hash=crypto.createHash('sha256').update(JSON.stringify({pool:pool.id,codes:[...codes].sort()})).digest('hex');
 const old=await prisma.licenseKeyAuditLog.findFirst({where:{action:'owner_telegram_import',userId:input.userId,meta:{path:['reference'],equals:input.reference}}});
 if(old){if(old.meta?.hash!==hash)throw Error('supplier_cdk_reference_conflict');return {...old.meta.result,reused:true};}
 const result=await licenseService.importKeys(pool.productKey,codes,{userId:input.userId},{activationSiteUrl:pool.site});
 const safe={pool:pool.id,productKey:pool.productKey,activationSiteUrl:pool.site,received:codes.length,inserted:result.inserted,skipped:result.skipped,conflicts:result.conflicts};
 await prisma.licenseKeyAuditLog.create({data:{keyId:null,action:'owner_telegram_import',userId:input.userId,meta:{reference:input.reference,hash,result:safe}}});
 return safe;
}
module.exports={importOwnerKeys};
if(require.main===module){
 const {prisma}=require('../../apps/admin-backend/dist/config/prisma.js');
 const {licenseService}=require('../../apps/admin-backend/dist/services/licenseService.js');
 (async()=>{let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>4096)throw Error('supplier_cdk_request_invalid');}process.stdout.write(JSON.stringify(await importOwnerKeys(JSON.parse(raw),{prisma,licenseService})));})()
 .catch(e=>{process.stdout.write(JSON.stringify({error:/^supplier_[a-z_]+$/.test(e.message)?e.message:'supplier_cdk_import_unconfirmed'}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
}
