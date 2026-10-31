import path from "path";
import { prisma } from "../config/prisma";
import { activationStore } from "../modules/orders/activation.store";
const modulePath=path.resolve(__dirname,"../../../../ops/subscription-routes/native-grok.cjs");
export const GROK_ZOVO_OWNER="website-grok-zovo-v1";
export const isGrokZovoProduct=(slug:unknown)=>["grok-plus-1","grok-premium-1","grok-super-1","grok-ultra-1"].includes(String(slug||""));
export function validateGrokZovoSession(raw:string):string{return require(modulePath).validate(raw);}
export function normalizeGrokZovoSession(raw:string):string{return require(modulePath).normalize(raw);}
export async function isGrokZovoOrder(id:string){
  const o=await prisma.order.findUnique({where:{id},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});
  const prior=activationStore.findByOrderId(id);
  if(o?.licenseKeys.length || (prior?.externalFulfillmentOwner!==GROK_ZOVO_OWNER && (prior?.externalFulfillmentOwner||prior?.cdk||prior?.taskId||prior?.attempts||prior?.status==='success'||prior?.lastProviderPayload?.submissionDiagnostics||prior?.lastProviderPayload?.supplierProcurement)))return false;
  return require(modulePath).eligible(o);
}
export async function tickGrokZovo(context:Record<string,unknown>){return require(modulePath).tick(context);}
