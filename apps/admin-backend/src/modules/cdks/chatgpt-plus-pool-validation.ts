export const CHATGPT_PLUS_PRODUCT_KEY = "chatgpt-plus-1";
export const CHATGPT_PLUS_IOS_SITE_URL = "https://vip.sxzfd.com";
export const CHATGPT_PLUS_FREE_SITE_URL = "https://aiee.fun";

export function validateChatGptPlusKeyImport(productKey: string, siteUrl: string, codes: string[]): string | null {
  if (productKey !== CHATGPT_PLUS_PRODUCT_KEY) return null;
  const pool = siteUrl === CHATGPT_PLUS_IOS_SITE_URL ? "iOS"
    : siteUrl === CHATGPT_PLUS_FREE_SITE_URL ? "Free" : null;
  if (!pool) return "Для ChatGPT Plus выберите пул iOS или Free.";
  const prefix = pool === "iOS" ? "IOS-" : "GPLUS-";
  if (codes.some((code) => !code.trim().toUpperCase().startsWith(prefix))) {
    return `В ${pool}-пул можно загрузить только ключи с префиксом ${prefix}. Вся партия отклонена.`;
  }
  return null;
}
