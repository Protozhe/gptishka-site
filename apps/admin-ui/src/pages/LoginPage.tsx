import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch (e: any) {
      setError(e.response?.data?.message || "Не удалось войти");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-[radial-gradient(circle_at_top_left,#22d3ee40,transparent_55%),radial-gradient(circle_at_bottom_right,#06b6d440,transparent_45%)] px-4">
      <form className="card w-full max-w-md p-6" onSubmit={onSubmit}>
        <h1 className="text-2xl font-bold">Вход в админ-панель</h1>
        <p className="mt-1 text-sm text-slate-500">Доступ только для выданных администраторских аккаунтов</p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-sm">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Пароль</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? "text" : "password"}
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
        </div>

        {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}

        <button className="btn-primary mt-5 w-full" disabled={pending}>
          {pending ? "Входим..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
