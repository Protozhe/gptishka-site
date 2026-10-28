import stylesheetUrl from "../styles/embedded-tools.css?url";
import { workspacePanels } from "./workspace";

const stylesheetId = "gptishka-admin-tool-appearance";

// Presentation only: never replace a tool document, reset its URL, submit a
// form, or recreate the frame. Existing service scripts own all interactions.
export function applyWorkspaceToolAppearance(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    const location = frame.contentWindow?.location;
    if (!doc?.head || !doc.body || !location || location.origin !== window.location.origin) return;
    const panel = workspacePanels.find(item => item.url === location.pathname);
    if (!panel) return;
    doc.body.classList.add("gptishka-tool-theme");
    doc.body.classList.toggle("gptishka-tool-dark", document.documentElement.classList.contains("dark"));
    doc.body.dataset.workspaceTool = panel.id;
    doc.querySelectorAll<HTMLElement>(".brand").forEach(brand => {
      if (brand.textContent?.replace(/\s+/g, " ").trim() === "FunPay Pulse" && !brand.querySelector("a,button,input,select,textarea")) {
        brand.textContent = "GPTishka";
      }
    });
    if (!doc.getElementById(stylesheetId)) {
      const link = doc.createElement("link");
      link.id = stylesheetId;
      link.rel = "stylesheet";
      link.href = new URL(stylesheetUrl, window.location.href).href;
      doc.head.appendChild(link);
    }
  } catch { /* A cross-origin or unfinished document keeps its own appearance. */ }
}

export function observeWorkspaceToolAppearance() {
  const observer = new MutationObserver(() => {
    document.querySelectorAll<HTMLIFrameElement>("iframe[data-workspace-tool]").forEach(applyWorkspaceToolAppearance);
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
