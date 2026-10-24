import path from "path";
import { prisma } from "../config/prisma";
const modulePath=path.resolve(__dirname,"../../../../ops/subscription-routes/native-claude.cjs");
export const CLAUDE_ZOVO_OWNER="website-claude-zovo-v1";
export const isClaudeZovoProduct=(slug:unknown)=>["claude-5x-max","claude-20x-max"].includes(String(slug||""));
export function validateClaudeZovoSession(raw:string):string{return require(modulePath).validate(raw);}
export async function isClaudeZovoOrder(id:string){
  const o=await prisma.order.findUnique({where:{id},include:{payments:true,items:{include:{product:true}},licenseKeys:true}});
  return require(modulePath).eligible(o);
}
export async function tickClaudeZovo(context:Record<string,unknown>){return require(modulePath).tick(context);}
