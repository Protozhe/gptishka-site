import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./layout/AdminLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import OrdersPage from "./pages/OrdersPage";
import AuditPage from "./pages/AuditPage";
import PromoCodesPage from "./pages/PromoCodesPage";
import UsersPage from "./pages/UsersPage";
import PartnersPage from "./pages/PartnersPage";
import PartnerEarningsPage from "./pages/PartnerEarningsPage";
import CdkKeysPage from "./pages/CdkKeysPage";
import "./styles/index.css";

const queryClient = new QueryClient();
const routerBaseEnv = import.meta.env.VITE_ADMIN_BASE_PATH as string | undefined;
const normalizedRouterBase = String(routerBaseEnv || "").trim();
const routerBase =
  normalizedRouterBase && normalizedRouterBase !== "/"
    ? normalizedRouterBase
    : import.meta.env.PROD
      ? "/admin"
      : undefined;

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; errorText: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorText: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { hasError: true, errorText: message };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ margin: 0, marginBottom: 8 }}>Admin UI error</h2>
          <p style={{ margin: 0, color: "#475569" }}>{this.state.errorText}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter basename={routerBase}>
            <Routes>
              <Route path="login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AdminLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="promocodes" element={<PromoCodesPage />} />
                  <Route path="partners" element={<PartnersPage />} />
                  <Route path="partner-earnings" element={<PartnerEarningsPage />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="cdks" element={<CdkKeysPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
