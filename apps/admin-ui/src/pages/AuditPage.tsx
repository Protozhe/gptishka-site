import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function AuditPage() {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await api.get("/audit", { params: { page: 1, limit: 100 } })).data,
  });

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3">Время</th>
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Действие</th>
              <th className="px-4 py-3">Сущность</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((row: any) => (
              <tr className="border-t border-slate-200 dark:border-slate-800" key={row.id}>
                <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{row.user?.email || "system"}</td>
                <td className="px-4 py-3">{row.action}</td>
                <td className="px-4 py-3">{row.entityType}:{row.entityId}</td>
                <td className="px-4 py-3">{row.ip || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
