import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api } from "../lib/api";

export default function UsersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("StrongPass!123");
  const [role, setRole] = useState("MANAGER");

  const create = useMutation({
    mutationFn: () => api.post("/users", { email, password, role }),
    onSuccess: () => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="card p-4 grid gap-2 md:grid-cols-4">
        <input className="input" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          <option>OWNER</option>
          <option>ADMIN</option>
          <option>MANAGER</option>
          <option>SUPPORT</option>
        </select>
        <button className="btn-primary">Добавить пользователя</button>
      </form>

      <div className="card p-4">
        <div className="space-y-2 text-sm">
          {(data?.items || []).map((u: any) => (
            <div key={u.id} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
              {u.email} - <b>{u.role.code}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
