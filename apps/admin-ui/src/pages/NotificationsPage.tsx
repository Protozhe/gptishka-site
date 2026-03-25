import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

function extractApiError(error: unknown, fallback: string) {
  const message =
    (error as any)?.response?.data?.message ||
    (error as any)?.response?.data?.error ||
    (error as any)?.message ||
    fallback;
  return String(message || fallback);
}

export default function NotificationsPage() {
  const [email, setEmail] = useState("askar_971@mail.ru");
  const [statusMessage, setStatusMessage] = useState("");

  const statusQuery = useQuery({
    queryKey: ["system", "mail-status"],
    queryFn: async () => (await api.get("/system/mail/status")).data,
    refetchInterval: 30000,
  });

  const sendTestMutation = useMutation({
    mutationFn: async () => (await api.post("/system/mail/test", { email })).data,
    onSuccess: () => {
      setStatusMessage(`Тестовое письмо отправлено на ${email}`);
      void statusQuery.refetch();
    },
    onError: (error) => {
      setStatusMessage(extractApiError(error, "Не удалось отправить тестовое письмо"));
      void statusQuery.refetch();
    },
  });

  const runCycleMutation = useMutation({
    mutationFn: async () => (await api.post("/system/account-notify/run")).data,
    onSuccess: () => {
      setStatusMessage("Ручной прогон уведомлений выполнен");
      void statusQuery.refetch();
    },
    onError: (error) => {
      setStatusMessage(extractApiError(error, "Не удалось запустить воркер уведомлений"));
    },
  });

  const onSendTest = (event: FormEvent) => {
    event.preventDefault();
    setStatusMessage("");
    sendTestMutation.mutate();
  };

  const smtpBadge = useMemo(() => {
    if (!statusQuery.data) return "Проверка...";
    return statusQuery.data.configured ? "SMTP настроен" : "SMTP не настроен";
  }, [statusQuery.data]);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Почта и уведомления</h2>
            <p className="mt-1 text-sm text-slate-500">Проверка отправки писем и запуск напоминаний по подписке.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {smtpBadge}
          </span>
        </div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <div className="text-xs uppercase text-slate-500">SMTP Host</div>
            <div className="mt-1 font-semibold">{statusQuery.data?.host || "Не задан"}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <div className="text-xs uppercase text-slate-500">SMTP Port</div>
            <div className="mt-1 font-semibold">{String(statusQuery.data?.port ?? "-")}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <div className="text-xs uppercase text-slate-500">From</div>
            <div className="mt-1 font-semibold">{statusQuery.data?.from || "Не задан"}</div>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <div className="text-xs uppercase text-slate-500">Напоминания</div>
            <div className="mt-1 font-semibold">{statusQuery.data?.notificationsEnabled ? "Включены" : "Выключены"}</div>
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="text-base font-bold">Тестовое письмо</h3>
        <form onSubmit={onSendTest} className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@example.com"
            required
          />
          <button className="btn-primary" disabled={sendTestMutation.isPending}>
            {sendTestMutation.isPending ? "Отправка..." : "Отправить тест"}
          </button>
        </form>
      </section>

      <section className="card p-4">
        <h3 className="text-base font-bold">Ручной прогон 7/3/1/expired</h3>
        <p className="mt-1 text-sm text-slate-500">
          Запускает проверку напоминаний сразу, не дожидаясь планировщика.
        </p>
        <button className="btn-secondary mt-3" onClick={() => runCycleMutation.mutate()} disabled={runCycleMutation.isPending}>
          {runCycleMutation.isPending ? "Запуск..." : "Запустить сейчас"}
        </button>
      </section>

      {(statusMessage || statusQuery.isError) && (
        <section className="card p-4 text-sm">
          <div className="font-semibold">Статус</div>
          <div className="mt-1 text-slate-600 dark:text-slate-300">
            {statusMessage || extractApiError(statusQuery.error, "Ошибка загрузки статуса SMTP")}
          </div>
        </section>
      )}
    </div>
  );
}

