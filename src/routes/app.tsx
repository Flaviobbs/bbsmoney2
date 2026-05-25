import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  // ⚠️ LOGIN TEMPORARIAMENTE DESABILITADO PARA TESTES
  // Para reativar, restaurar o bloco com useAuth + redirect para /login.
  useAuth();
  void useNavigate;
  void useEffect;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-border/50 px-4">
            <SidebarTrigger />
            <div className="text-sm font-medium text-muted-foreground">BBSMoney</div>
          </header>
          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

