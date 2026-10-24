export const workspacePanels = [
  { id: "chats", label: "Чаты и активации", url: "/chats/", description: "Диалоги FunPay и PlayerOK, фото и выполнение заказов" },
  { id: "reminders", label: "Напоминания", url: "/subscription-reminders.html", description: "Подписки клиентов и напоминания о продлении" },
  { id: "profit", label: "Прибыль", url: "/profit/", description: "Продажи, расходы и результаты" },
  { id: "capital", label: "Капитал", url: "/capital/", description: "Балансы, запасы и движение средств" },
] as const;

export function workspaceSection(pathname: string) {
  return /^\/workspace\/([a-z]+)\/?$/.exec(pathname)?.[1] || "";
}
