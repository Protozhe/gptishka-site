import { HandCoins, KeyRound, LayoutDashboard, Package, ScrollText, ShoppingCart, TicketPercent, Users, Wallet } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../hooks/useAuth";

const TEXT = {
  dashboard: "\u0414\u0430\u0448\u0431\u043e\u0440\u0434",
  products: "\u0422\u043e\u0432\u0430\u0440\u044b",
  orders: "\u0417\u0430\u043a\u0430\u0437\u044b",
  audit: "\u0410\u0443\u0434\u0438\u0442",
  promo: "\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u044b",
  partners: "\u041f\u0430\u0440\u0442\u043d\u0435\u0440\u044b",
  earnings: "\u041d\u0430\u0447\u0438\u0441\u043b\u0435\u043d\u0438\u044f",
  users: "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438",
  cdks: "CDK \u043a\u043b\u044e\u0447\u0438",
  panel: "\u041f\u0430\u043d\u0435\u043b\u044c \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f",
  role: "\u0420\u043e\u043b\u044c",
  title: "\u0410\u0434\u043c\u0438\u043d-\u043f\u0430\u043d\u0435\u043b\u044c",
  logout: "\u0412\u044b\u0439\u0442\u0438",
};

const nav = [
  { to: "/", label: TEXT.dashboard, icon: LayoutDashboard },
  { to: "/products", label: TEXT.products, icon: Package },
  { to: "/orders", label: TEXT.orders, icon: ShoppingCart },
  { to: "/audit", label: TEXT.audit, icon: ScrollText },
  { to: "/promocodes", label: TEXT.promo, icon: TicketPercent },
  { to: "/partners", label: TEXT.partners, icon: HandCoins },
  { to: "/partner-earnings", label: TEXT.earnings, icon: Wallet },
  { to: "/users", label: TEXT.users, icon: Users },
  { to: "/cdks", label: TEXT.cdks, icon: KeyRound },
];

export function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[270px_1fr]">
      <aside className="border-r border-slate-200 bg-white/90 p-5 dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-600">GPTishka</div>
          <div className="mt-1 text-xl font-extrabold">{TEXT.panel}</div>
        </div>

        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-cyan-600 text-white"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  }`
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-10 rounded-2xl bg-slate-100 p-3 text-xs dark:bg-slate-900">
          <div className="font-semibold">{user?.email}</div>
          <div className="mt-1 text-slate-500">{TEXT.role}: {user?.role}</div>
        </div>
      </aside>

      <main className="p-4 lg:p-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{TEXT.title}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="btn-secondary" onClick={() => logout()}>
              {TEXT.logout}
            </button>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
