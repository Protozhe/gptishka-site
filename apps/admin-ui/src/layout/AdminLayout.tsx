import {
  BellRing,
  HandCoins,
  KeyRound,
  LayoutDashboard,
  Home,
  Megaphone,
  Package,
  PanelsTopLeft,
  ScrollText,
  ShoppingCart,
  TicketPercent,
  UserSearch,
  Users,
  Wallet,
  Bot,
  ShieldCheck,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../hooks/useAuth";
import { useState } from "react";
import { Activity, MessageSquare, Clock3, Landmark, ChevronRight, LogOut } from "lucide-react";
import { WorkspacePanels } from "../components/WorkspacePanels";
import { workspacePanels, workspaceSection } from "../lib/workspace";
import { AdminSectionFrame } from "../components/AdminSectionFrame";

const TEXT = {
  dashboard: "\u0414\u0430\u0448\u0431\u043e\u0440\u0434",
  products: "\u0422\u043e\u0432\u0430\u0440\u044b",
  showcase: "\u0412\u0438\u0442\u0440\u0438\u043d\u0430",
  homepage: "\u0413\u043b\u0430\u0432\u043d\u0430\u044f",
  orders: "\u0417\u0430\u043a\u0430\u0437\u044b",
  storefront: "\u041f\u043b\u0430\u0448\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
  audit: "\u0410\u0443\u0434\u0438\u0442",
  promo: "\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u044b",
  partners: "\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b",
  earnings: "\u041d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u0438\u044f",
  users: "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438",
  cdks: "CDK \u043a\u043b\u044e\u0447\u0438",
  notifications: "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f",
  telegramBots: "Telegram Bots",
  telegramCdks: "Telegram CDK",
  accountTools: "\u041a\u0430\u0431\u0438\u043d\u0435\u0442\u044b",
  panel: "\u041f\u0430\u043d\u0435\u043b\u044c \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f",
  role: "\u0420\u043e\u043b\u044c",
  title: "\u0410\u0434\u043c\u0438\u043d-\u043f\u0430\u043d\u0435\u043b\u044c",
  logout: "\u0412\u044b\u0439\u0442\u0438",
};

const nav = [
  { to: "/", label: TEXT.dashboard, icon: LayoutDashboard },
  { to: "/products", label: TEXT.products, icon: Package },
  { to: "/homepage", label: TEXT.homepage, icon: Home },
  { to: "/showcase", label: TEXT.showcase, icon: PanelsTopLeft },
  { to: "/orders", label: TEXT.orders, icon: ShoppingCart },
  { to: "/storefront", label: TEXT.storefront, icon: Megaphone },
  { to: "/audit", label: TEXT.audit, icon: ScrollText },
  { to: "/promocodes", label: TEXT.promo, icon: TicketPercent },
  { to: "/partners", label: TEXT.partners, icon: HandCoins },
  { to: "/partner-earnings", label: TEXT.earnings, icon: Wallet },
  { to: "/users", label: TEXT.users, icon: Users },
  { to: "/cdks", label: TEXT.cdks, icon: KeyRound },
  { to: "/telegram-cdks", label: TEXT.telegramCdks, icon: KeyRound },
  { to: "/account-tools", label: TEXT.accountTools, icon: UserSearch },
  { to: "/notifications", label: TEXT.notifications, icon: BellRing },
  { to: "/telegram-bots", label: TEXT.telegramBots, icon: Bot },
  { to: "/sessions", label: "Устройства и входы", icon: ShieldCheck },
];

const operationsNav = [
  { to: "/workspace/overview", label: "Обзор", icon: Activity },
  { to: "/workspace/chats", label: "Чаты и активации", icon: MessageSquare },
  { to: "/workspace/reminders", label: "Напоминания", icon: Clock3 },
  { to: "/workspace/profit", label: "Прибыль", icon: Wallet },
  { to: "/workspace/capital", label: "Капитал", icon: Landmark },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const section = workspaceSection(location.pathname);
  const embedded = workspacePanels.some(p => p.id === section);
  const title = operationsNav.find(item => item.to === location.pathname)?.label || nav.find(item => item.to === location.pathname)?.label || "Управление";
  const allowedOps = user?.role === "OWNER" || user?.role === "ADMIN";
  function links(items: typeof nav) { return items.map(item => {
    const Icon = item.icon;
    return <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setMenuOpen(false)} className={({isActive}) => `workspace-nav-link ${isActive ? "selected" : ""}`}><Icon size={18} /><span>{item.label}</span><ChevronRight size={13} className="workspace-nav-chevron" /></NavLink>;
  }); }
  return <div className={`workspace-shell ${menuOpen ? "menu-open" : ""}`}>
    <aside className="workspace-sidebar">
      <NavLink to={allowedOps ? "/workspace/overview" : "/"} className="workspace-brand" onClick={() => setMenuOpen(false)}><span className="workspace-logo">G<span>•</span></span><div><strong>GPTishka</strong><small>Центр управления</small></div></NavLink>
      <button className="workspace-mobile-menu btn-secondary" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? "Закрыть" : "Меню"}</button>
      <nav id="admin-navigation" className="workspace-navigation">
        {allowedOps && <><p className="workspace-nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</p>{links(operationsNav)}</>}
        <details className="workspace-site-menu" open={!section}><summary><Package size={17} /> Сайт и продажи <ChevronRight size={14} /></summary><div>{links(nav.filter(item => item.to !== "/sessions"))}</div></details>
        <p className="workspace-nav-label">ДОСТУП</p>{links(nav.filter(item => item.to === "/sessions"))}
      </nav>
      <div className="workspace-user"><span className="workspace-avatar">{user?.email?.[0]?.toUpperCase() || "G"}</span><div><strong>{user?.firstName || "Мой профиль"}</strong><small>{user?.role === "OWNER" ? "Владелец" : user?.role}</small></div><span className="workspace-online" title="Сеанс активен" /></div>
    </aside>
    <main className="workspace-main">
      <header className="workspace-header"><div className="workspace-breadcrumb"><span>Управление</span><ChevronRight size={14} /><h1>{title}</h1></div><div className="flex items-center gap-2"><span className="workspace-session"><ShieldCheck size={14} /> Единый вход</span><ThemeToggle /><button className="workspace-logout" aria-label="Выйти" onClick={() => void logout()}><LogOut size={17} /></button></div></header>
      <div className={embedded ? "workspace-content embedded" : "workspace-content"}><AdminSectionFrame pathname={location.pathname}><Outlet /></AdminSectionFrame>{allowedOps && <WorkspacePanels section={section} />}</div>
    </main>
  </div>;
}
