import type { ReactNode } from "react";

export const adminSections: Record<string, { title: string; description: string }> = {
  "/": { title: "Продажи сайта", description: "Выручка, товары и оплаченные заказы за выбранный период" },
  "/products": { title: "Товары", description: "Каталог, цены, доступность и настройки выдачи" },
  "/homepage": { title: "Главная страница", description: "Баннеры, ссылки и разделы на главной странице сайта" },
  "/showcase": { title: "Витрина", description: "Размещение товаров и оформление карточек" },
  "/storefront": { title: "Плашка клиентов", description: "Показ покупок на сайте и настройки конфиденциальности" },
  "/audit": { title: "Журнал действий", description: "Кто, когда и какие изменения выполнил в админке" },
  "/promocodes": { title: "Промокоды", description: "Создание кодов, скидки, лимиты и результаты использования" },
  "/partners": { title: "Партнёры", description: "Партнёрские промокоды, условия и оплаченные сделки" },
  "/partner-earnings": { title: "Начисления", description: "Партнёрские вознаграждения и отметки о выплатах" },
  "/users": { title: "Пользователи", description: "Сотрудники и роли доступа к админке" },
  "/telegram-cdks": { title: "Ключи Telegram", description: "Запасы, загрузка и управление ключами для Telegram-ботов" },
  "/account-tools": { title: "Кабинеты клиентов", description: "Поиск заказов, доступы и действия поддержки" },
  "/notifications": { title: "Уведомления", description: "Состояние почты и управление напоминаниями" },
  "/telegram-bots": { title: "Telegram-боты", description: "Клиенты, события, оплаты и активации в ботах" },
  "/sessions": { title: "Устройства и входы", description: "Активные сеансы и управление доступом с других устройств" },
};

// The frame stays mounted across routes. Tool panels remain its siblings so
// changing a page cannot recreate an already opened chat or discard its draft.
export function AdminSectionFrame({ pathname, children }: { pathname: string; children: ReactNode }) {
  const section = adminSections[pathname.replace(/\/$/, "") || "/"];
  return <div className={section ? "admin-section" : "admin-route-content"} data-admin-section={section ? pathname : undefined}>
    {section && <header className="admin-page-heading"><h2>{section.title}</h2><p>{section.description}</p></header>}
    {children}
  </div>;
}
