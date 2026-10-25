'use strict';
const {prisma}=require('/var/www/gptishka-new/apps/admin-backend/dist/config/prisma.js');
(async()=>{let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>2048)throw Error()}
const {user_id}=JSON.parse(raw);if(typeof user_id!=='string'||user_id.length>128)throw Error();
const u=await prisma.user.findUnique({where:{id:user_id},select:{isActive:true,role:{select:{code:true}}}});
console.log(JSON.stringify({allowed:u?.isActive===true&&u.role?.code==='OWNER'}));})().catch(()=>{console.log(JSON.stringify({allowed:false}));process.exitCode=1}).finally(()=>prisma.$disconnect());
