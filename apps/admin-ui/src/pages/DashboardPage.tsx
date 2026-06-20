import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { Skeleton } from "../components/Skeleton";

type SalesPoint = {
  date: string;
  revenue: number;
  orders: number;
};

function formatShortDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatFullDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/analytics/dashboard")).data,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const cards = [
    { label: "Выручка за сегодня", value: money(data.revenueToday) },
    { label: "Выручка за месяц", value: money(data.revenueMonth) },
    { label: "Заказы за месяц", value: data.ordersMonth },
    { label: "Конверсия", value: `${data.conversion}%` },
    { label: "Средний чек", value: money(data.avgTicket) },
  ];

  const salesSeries: SalesPoint[] = Array.isArray(data.salesSeries) ? data.salesSeries : [];
  const dailyTransactions = salesSeries
    .filter((point) => Number(point.orders || 0) > 0 || Number(point.revenue || 0) > 0)
    .slice()
    .reverse();

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div className="card p-4" key={card.label}>
            <div className="text-xs uppercase text-slate-500">{card.label}</div>
            <div className="mt-2 text-2xl font-bold">{card.value}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="card p-4">
          <h2 className="font-bold">Динамика продаж (30 дней)</h2>
          <div className="mt-3 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesSeries}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0891b2" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={formatShortDay} minTickGap={22} />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => `Дата: ${formatFullDay(String(value || ""))}`}
                  formatter={(value, _name, payload) => {
                    const row = payload?.payload as SalesPoint | undefined;
                    return [money(Number(value || 0)), `Выручка · транзакций: ${row?.orders || 0}`];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0891b2"
                  fillOpacity={1}
                  fill="url(#salesGradient)"
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-bold">Топ товары</h2>
          <div className="mt-3 space-y-2">
            {data.topProducts.map((item: any) => (
              <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800" key={item.productId}>
                <div className="font-semibold">{item.title}</div>
                <div className="text-slate-500">Продано: {item.qty}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-bold">Транзакции по дням (30 дней)</h2>
        <p className="mt-1 text-sm text-slate-500">Показываются только дни, в которые были оплаты.</p>
        <div className="mt-3 overflow-x-auto">
          {dailyTransactions.length === 0 ? (
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800">
              За выбранный период оплаченных транзакций не было.
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Дата</th>
                  <th className="py-2 pr-4 font-semibold">Транзакций</th>
                  <th className="py-2 pr-0 font-semibold">Выручка</th>
                </tr>
              </thead>
              <tbody>
                {dailyTransactions.map((item) => (
                  <tr className="border-t border-slate-200/70 dark:border-slate-700/70" key={item.date}>
                    <td className="py-2 pr-4">{formatFullDay(item.date)}</td>
                    <td className="py-2 pr-4">{item.orders}</td>
                    <td className="py-2 pr-0 font-semibold">{money(Number(item.revenue || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
