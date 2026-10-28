import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Session = { id: string; userAgent: string | null; ip: string | null; createdAt: string; expiresAt: string; current: boolean };
export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try { setSessions((await api.get("/auth/sessions")).data); setError(""); }
    catch { setError("Не удалось загрузить сеансы. Обновите страницу."); }
  }
  useEffect(() => { void load(); }, []);
  async function revoke(id?: string) {
    setBusy(true);
    try {
      if (id) await api.delete(`/auth/sessions/${encodeURIComponent(id)}`);
      else await api.post("/auth/sessions/revoke-others");
      await load();
    } catch { setError("Не удалось завершить сеанс. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <h2 className="text-xl font-bold">Активные сеансы</h2>
    <p className="text-sm text-slate-500">Здесь можно завершить вход с другого компьютера или телефона. Доступ прекращается сразу.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <button className="btn-secondary" disabled={busy || !sessions.some(s => !s.current)} onClick={() => void revoke()}>Выйти на остальных устройствах</button>
    <div className="space-y-3">{sessions.map(session => <article key={session.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="font-semibold">{session.current ? "Это устройство" : "Другой вход"}</div>
      <p className="break-words text-sm text-slate-500">{session.userAgent || "Браузер не определён"}</p>
      <p className="text-sm">{session.ip || "Адрес не определён"} · Вход {new Date(session.createdAt).toLocaleString("ru-RU")}</p>
      {!session.current && <button className="btn-secondary mt-3" disabled={busy} onClick={() => void revoke(session.id)}>Завершить вход</button>}
    </article>)}</div>
  </section>;
}
