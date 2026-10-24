import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, KeyRound, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { workspacePanels, workspaceSection } from "../lib/workspace";
import { useAuth } from "../hooks/useAuth";

type Poller = { account_id: string; code: string };
type Account = { id: number; username: string; status: string };
type Check = { name?: string; label?: string; key?: string; ok: boolean };
async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "Сеанс завершён. Войдите в панель повторно." : "Не удалось получить состояние сервиса.");
  return response.json();
}
const descriptions: Record<string, string> = {
  account_login_required: "Обновите вход в FunPay", identity_unverified: "Нужно проверить аккаунт FunPay",
  rate_limited: "Пауза по ограничению площадки", connection_failed: "Площадка временно недоступна",
  reconnected_waiting_for_poll: "Вход обновлён, проверяем соединение",
};

export default function WorkspacePage() {
  const section = workspaceSection(useLocation().pathname);
  const { user } = useAuth();
  const [gateway, setGateway] = useState<{ ok: boolean; pollers: Poller[] }>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState<Date>();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [notice, setNotice] = useState("");
  async function reload() {
    setBusy(true);
    const results = await Promise.allSettled([
      read<{ ok: boolean; pollers: Poller[] }>("/worker-api/status"),
      read<Account[]>("/worker-api/accounts/"),
      read<{ checks?: Record<string, boolean>; at?: string }>("/ops/status.json"),
    ]);
    if (results[0].status === "fulfilled") setGateway(results[0].value);
    if (results[1].status === "fulfilled") setAccounts(results[1].value);
    if (results[2].status === "fulfilled") {
      const status = results[2].value.checks || {};
      const labels: Record<string, string> = { gptishka_storefront: "Сайт", payment_state_consistent: "Оплаты", fulfillment_health_query: "Обработка заказов", telegram_reply_worker: "Ответы в Telegram", catalog_backup: "Копии лотов", service_security_boundaries: "Защита сервисов", backup_service: "Резервные копии" };
      setChecks(Object.entries(labels).map(([name, label]) => ({ name, label, ok: status[name] === true })));
    }
    setError(results.some(r => r.status === "rejected") ? "Часть данных недоступна. Показываем последнее полученное состояние." : "");
    setStamp(new Date());setBusy(false);
  }
  useEffect(() => {
    if (workspacePanels.some(p => p.id === section)) return;
    void reload();const timer = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, 60000);
    return () => window.clearInterval(timer);
  }, [section]);
  if (workspacePanels.some(p => p.id === section)) return null;
  async function reconnect(event: React.FormEvent) {
    event.preventDefault();if (!edit || busy) return;setBusy(true);setNotice("");
    try {
      const response = await fetch("/ops-api/funpay/reconnect", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: edit, golden_key: key.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(descriptions[result.detail] || ({ identity_unverified: "Ключ принадлежит другому аккаунту. Изменения не сохранены.", invalid_session_key: "Проверьте формат golden_key.", account_not_active: "Отключённый аккаунт нельзя включить через обновление входа." } as Record<string,string>)[result.detail] || "Не удалось проверить ключ. Сохранённый вход не изменён.");
      setKey("");setEdit(null);setNotice("Вход обновлён. FunPay подтвердил нужный аккаунт; автоматическая обработка продолжится.");await reload();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Не удалось обновить вход."); }
    finally { setBusy(false); }
  }
  return <div className="workspace-overview">
    <div className="workspace-hero"><div><span className="workspace-eyebrow">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</span><h2>Всё под контролем</h2><p>Продажи, диалоги и автоматизация — в одной вкладке.</p></div><div className="workspace-secure"><ShieldCheck size={22} /><span>Единый вход<small>Защищённая сессия</small></span></div></div>
    <div className="workspace-shortcuts">{workspacePanels.map((panel, index) => <Link key={panel.id} to={`/workspace/${panel.id}`}><span className="workspace-shortcut-icon">{["↗", "◷", "₽", "◇"][index]}</span><ArrowUpRight className="workspace-shortcut-arrow" size={18} /><h3>{panel.label}</h3><p>{panel.description}</p></Link>)}</div>
    <section className="workspace-card"><div className="workspace-card-heading"><div><h3><Activity size={19} /> Состояние и автоматизация</h3><p>Время автоподнятия: 08:00–02:00 МСК с учётом ограничений площадки.</p></div><button className="btn-secondary" disabled={busy} onClick={() => void reload()}><RefreshCw size={15} /> Обновить</button></div>
      {error && <p role="alert" className="workspace-warning">{error}</p>}
      <div className="workspace-service-row"><div><strong>FunPay</strong><small>Чаты, заказы и автоподнятие</small></div><span className={`workspace-pill ${gateway?.ok ? "good" : "warn"}`}>{gateway ? gateway.ok ? "Работает" : "Требуется внимание" : "Проверяем…"}</span></div>
      {gateway?.pollers.map(p => <div className="workspace-account-row" key={p.account_id}><span className={p.code === "ok" ? "good" : "warn"}>{p.code === "ok" ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}</span><div><strong>{accounts.find(a => String(a.id) === p.account_id)?.username || `Аккаунт ${p.account_id}`}</strong><small>{p.code === "ok" ? "Соединение с площадкой установлено" : descriptions[p.code] || "Требуется проверка соединения"}</small></div>{user?.canManageMarketplaceAccounts === true && p.code !== "ok" && <button className="btn-secondary" onClick={() => { setEdit(p.account_id);setKey("");setNotice(""); }}><KeyRound size={14} /> Обновить вход</button>}</div>)}
      {checks.length > 0 && <div className="workspace-checks">{checks.map((check, i) => <span key={check.key || check.name || i} className={`workspace-pill ${check.ok ? "good" : "warn"}`}>{check.ok ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />}{check.label || check.name || "Проверка сервиса"}</span>)}</div>}
      <div className="workspace-updated"><Clock3 size={13} />{stamp ? `Данные получены в ${stamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "Загружаем состояние…"}</div>
    </section>
    {notice && <p role="status" className="workspace-warning">{notice}</p>}
    {edit && <section className="workspace-card"><h3>Обновить вход · {accounts.find(a => String(a.id) === edit)?.username}</h3><p className="mt-2 mb-4 text-sm text-slate-500">Войдите в нужный аккаунт на funpay.com и скопируйте значение cookie golden_key. Проверим владельца сессии до сохранения. Ключ хранится зашифрованным.</p><form onSubmit={reconnect} className="flex flex-wrap gap-3"><input aria-label="Новый golden_key" autoFocus type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} required minLength={16} maxLength={512} className="input flex-1" /><button className="btn-primary" disabled={busy}>Проверить и сохранить</button><button type="button" className="btn-secondary" onClick={() => {setEdit(null);setKey("");}}>Отмена</button></form></section>}
    <div className="workspace-footer"><ShieldCheck size={15} /> Сайт, оплаты и выполнение заказов продолжают работать при переключении разделов.</div>
  </div>;
}
