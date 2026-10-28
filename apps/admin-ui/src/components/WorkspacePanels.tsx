import { useEffect, useState } from "react";
import { workspacePanels } from "../lib/workspace";
import { applyWorkspaceToolAppearance, observeWorkspaceToolAppearance } from "../lib/workspace-appearance";

// Keep visited tools mounted: switching sections must not discard a draft.
export function WorkspacePanels({ section }: { section: string }) {
  const [visited, setVisited] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(observeWorkspaceToolAppearance, []);
  useEffect(() => {
    if (workspacePanels.some(p => p.id === section)) setVisited(old => old.includes(section) ? old : [...old, section]);
  }, [section]);
  return <>{workspacePanels.filter(p => visited.includes(p.id)).map(panel => <section key={panel.id} hidden={section !== panel.id} className="workspace-tool" aria-label={panel.label}>
    {errors[panel.id] && <div role="alert" className="workspace-warning">{errors[panel.id]} <button onClick={() => window.location.assign("/admin/login")}>Войти</button></div>}
    <iframe title={panel.label} src={panel.url} data-workspace-tool={panel.id} referrerPolicy="same-origin" onLoad={event => {
      applyWorkspaceToolAppearance(event.currentTarget);
      try {
        const child = event.currentTarget.contentWindow;
        if (child?.location.pathname.startsWith("/admin/login")) setErrors(old => ({ ...old, [panel.id]: "Сеанс завершён. Войдите повторно для продолжения." }));
        else setErrors(old => ({ ...old, [panel.id]: "" }));
      } catch { setErrors(old => ({ ...old, [panel.id]: "Не удалось открыть раздел. Обновите страницу." })); }
    }} />
  </section>)}</>;
}
