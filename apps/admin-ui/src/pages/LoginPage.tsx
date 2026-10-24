import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const { login, verifyTelegram, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function finishLogin() {
    const next = new URLSearchParams(location.search).get("next") || "";
    if (/^\/(?:ops|chats|profit|capital)(?:\/|$)/.test(next) || next === "/subscription-reminders.html") window.location.assign(next);
    else if (/^\/admin(?:\/|$)/.test(next) && !next.startsWith("/admin/login")) window.location.assign(next);
    else navigate(user?.role === "OWNER" || user?.role === "ADMIN" ? "/workspace/overview" : "/", { replace: true });
  }

  // Restore a valid shared session instead of asking for the password again.
  useEffect(() => {
    if (!loading && user && !challengeId && !pending) finishLogin();
  }, [loading, user, challengeId, pending]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (challengeId) {
        await verifyTelegram(challengeId, code);
        finishLogin();
      } else {
        const challenge = await login(email, password);
        setPassword("");
        if (challenge) setChallengeId(challenge.challengeId);
        else finishLogin();
      }
    } catch (e: any) {
      const payload = e?.response?.data;
      const message =
        (typeof payload === "string" ? payload : payload?.message) ||
        e?.message ||
        "Не удалось войти";
      setError(String(message));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-[radial-gradient(circle_at_top_left,#22d3ee40,transparent_55%),radial-gradient(circle_at_bottom_right,#06b6d440,transparent_45%)] px-4">
      <form className="card w-full max-w-md p-6" onSubmit={onSubmit}>
        <h1 className="text-2xl font-bold">Вход в админ-панель</h1>
        <p className="mt-1 text-sm text-slate-500">{challengeId ? "Подтвердите новый IP кодом из личного чата с @myadminiibot. Код действует 5 минут." : "Войдите с паролем. Код из Telegram понадобится только при входе с нового IP."}</p>

        {challengeId ? <div className="mt-5">
          <label className="mb-1 block text-sm" htmlFor="telegram-code">Код из Telegram</label>
          <input id="telegram-code" className="input text-center text-2xl tracking-[0.4em]" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
        </div> : <div className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-sm">Email</label>
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Пароль</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>}

        {error ? <div role="alert" className="mt-3 text-sm text-rose-600">{error}</div> : null}

        <button className="btn-primary mt-5 w-full" disabled={pending}>
          {pending ? "Проверяем..." : challengeId ? "Подтвердить вход" : "Войти"}
        </button>
        {challengeId ? <button type="button" className="mt-4 w-full text-sm text-slate-500" disabled={pending} onClick={() => { setChallengeId(null); setCode(""); setError(null); }}>Начать вход заново</button> : null}
      </form>
    </div>
  );
}
