'use strict';
const crypto = require('node:crypto');
const SITES = ['https://aichongzhi.fun', 'https://aiee.fun'];
async function claim(input, prisma) {
  const {scope, credits, platform, action} = input || {};
  if (!/^m[a-f0-9]{31}$/.test(scope || '') || ![250,500,1000].includes(credits)
      || !['funpay','playerok'].includes(platform) || !['claim','attest'].includes(action)) throw Error('supplier_stock_contract_invalid');
  const productKey = 'codex-' + credits;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${'market-stock:'+scope})::bigint)`;
    const prior = await tx.licenseKeyAuditLog.findMany({where:{action:'assign_marketplace_stock',meta:{path:['scope'],equals:scope}},take:2});
    let row;
    if (prior.length) {
      if (prior.length !== 1) throw Error('supplier_stock_binding_invalid');
      row = await tx.licenseKey.findUnique({where:{id:prior[0].keyId}});
      if (!row || row.status !== 'used' || row.orderId || row.productKey !== productKey || !SITES.includes(row.activationSiteUrl)
          || prior[0].meta.platform !== platform || prior[0].meta.activationSiteUrl !== row.activationSiteUrl) throw Error('supplier_stock_binding_invalid');
    } else {
      if (action === 'attest') throw Error('supplier_stock_binding_invalid');
      const picked = await tx.$queryRaw`SELECT id FROM license_keys WHERE product_key=${productKey}
        AND (activation_site_url=${SITES[0]} OR activation_site_url=${SITES[1]}) AND status='available'
        AND order_id IS NULL AND used_at IS NULL AND reserved_at IS NULL
        ORDER BY CASE WHEN activation_site_url=${SITES[0]} THEN 0 ELSE 1 END, created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!picked.length) return {state:'empty'};
      const id = picked[0].id;
      const updated = await tx.licenseKey.updateMany({where:{id,status:'available',orderId:null,usedAt:null,reservedAt:null},data:{status:'used',usedAt:new Date()}});
      if (updated.count !== 1) throw Error('supplier_stock_changed');
      row = await tx.licenseKey.findUnique({where:{id}});
      await tx.licenseKeyAuditLog.create({data:{keyId:id,action:'assign_marketplace_stock',userId:null,
        meta:{scope,platform,productKey,activationSiteUrl:row.activationSiteUrl}}});
    }
    if (input.key_id && input.key_id !== row.id) throw Error('supplier_stock_binding_invalid');
    return {state:'shared_stock',native_key_id:row.id,credits,product_key:productKey,activationSiteUrl:row.activationSiteUrl,
      fingerprint:crypto.createHash('sha256').update(row.keyValue).digest('hex'),...(action==='claim'?{code:row.keyValue}:{})};
  });
}
module.exports = {claim};
if (require.main === module) {
  const {prisma} = require('../../apps/admin-backend/dist/config/prisma.js');
  let raw=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',part=>{raw+=part;if(raw.length>4096)process.exit(1)});
  process.stdin.on('end',async()=>{
    try { process.stdout.write(JSON.stringify(await claim(JSON.parse(raw),prisma))); }
    catch { process.stdout.write(JSON.stringify({error:'supplier_stock_unconfirmed'})); process.exitCode=1; }
    finally { await prisma.$disconnect(); }
  });
}
