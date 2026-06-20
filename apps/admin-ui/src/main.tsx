import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./layout/AdminLayout";
import "./styles/index.css";

const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const ProductsPage = React.lazy(() => import("./pages/ProductsPage"));
const ShowcasePage = React.lazy(() => import("./pages/ShowcasePage"));
const OrdersPage = React.lazy(() => import("./pages/OrdersPage"));
const AuditPage = React.lazy(() => import("./pages/AuditPage"));
const PromoCodesPage = React.lazy(() => import("./pages/PromoCodesPage"));
const UsersPage = React.lazy(() => import("./pages/UsersPage"));
const PartnersPage = React.lazy(() => import("./pages/PartnersPage"));
const PartnerEarningsPage = React.lazy(() => import("./pages/PartnerEarningsPage"));
const CdkKeysPage = React.lazy(() => import("./pages/CdkKeysPage"));
const StorefrontTickerPage = React.lazy(() => import("./pages/StorefrontTickerPage"));
const NotificationsPage = React.lazy(() => import("./pages/NotificationsPage"));
const AccountToolsPage = React.lazy(() => import("./pages/AccountToolsPage"));
const TelegramBotsPage = React.lazy(() => import("./pages/TelegramBotsPage"));
const TelegramCdkPage = React.lazy(() => import("./pages/TelegramCdkPage"));

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
            <React.Suspense fallback={<div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>Loading...</div>}>
              <Routes>
                <Route path="login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AdminLayout />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="products" element={<ProductsPage />} />
                    <Route path="showcase" element={<ShowcasePage />} />
                    <Route path="orders" element={<OrdersPage />} />
                    <Route path="storefront" element={<StorefrontTickerPage />} />
                    <Route path="audit" element={<AuditPage />} />
                    <Route path="promocodes" element={<PromoCodesPage />} />
                    <Route path="partners" element={<PartnersPage />} />
                    <Route path="partner-earnings" element={<PartnerEarningsPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="cdks" element={<CdkKeysPage />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="account-tools" element={<AccountToolsPage />} />
                    <Route path="telegram-bots" element={<TelegramBotsPage />} />
                    <Route path="telegram-cdks" element={<TelegramCdkPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </React.Suspense>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
