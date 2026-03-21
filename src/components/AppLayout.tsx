import { Link, Outlet, useLocation } from 'react-router-dom';
import { Calculator, History, FileText, LogOut, Sparkles, Menu, X, LayoutDashboard, Settings, User, ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/calculator', label: 'Calculator', icon: Calculator },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
  { path: '/ai-input', label: 'AI Input', icon: Sparkles },
  { path: '/history', label: 'History', icon: History },
  { path: '/invoices', label: 'Invoices', icon: FileText },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  return (
    <div className="min-h-screen">
      {/* ── Desktop Floating Sidebar ── */}
      <aside
        className={cn(
          "hidden md:flex flex-col fixed left-4 top-4 bottom-4 z-40 rounded-3xl bg-[#1F1F21] shadow-2xl transition-all duration-300 ease-in-out print:hidden overflow-hidden",
          sidebarExpanded ? "w-[220px]" : "w-[72px]"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center h-[72px] px-4 shrink-0",
          sidebarExpanded ? "gap-3 justify-start" : "justify-center"
        )}>
          <div className="h-10 w-10 rounded-2xl bg-[#FFD528] flex items-center justify-center shrink-0">
            <Calculator className="h-5 w-5 text-[#1F1F21]" />
          </div>
          {sidebarExpanded && (
            <span className="text-lg font-bold text-white tracking-tight whitespace-nowrap">
              CrewRate
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link key={path} to={path}>
                <div
                  className={cn(
                    "flex items-center h-11 rounded-2xl transition-all duration-200 cursor-pointer",
                    sidebarExpanded ? "gap-3 px-3 justify-start" : "justify-center px-0",
                    isActive
                      ? "bg-[#FFD528] text-[#1F1F21]"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {sidebarExpanded && (
                    <span className="text-sm font-medium whitespace-nowrap">
                      {label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-4 border-t border-white/10" />

        {/* Bottom: Settings + User */}
        <div className="px-3 py-3 space-y-1">
          <Link to="/settings">
            <div
              className={cn(
                "flex items-center h-11 rounded-2xl transition-all duration-200 cursor-pointer",
                sidebarExpanded ? "gap-3 px-3 justify-start" : "justify-center px-0",
                location.pathname === '/settings'
                  ? "bg-[#FFD528] text-[#1F1F21]"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              <Settings className="h-5 w-5 shrink-0" />
              {sidebarExpanded && (
                <span className="text-sm font-medium whitespace-nowrap">Settings</span>
              )}
            </div>
          </Link>

          {/* User row */}
          <div className={cn(
            "flex items-center h-11 px-1 mt-1",
            sidebarExpanded ? "gap-3 justify-start" : "justify-center"
          )}>
            <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-white/80" />
            </div>
            {sidebarExpanded && (
              <>
                <p className="flex-1 text-sm font-medium text-white truncate min-w-0">
                  {user?.email?.split('@')[0]}
                </p>
                <button
                  onClick={signOut}
                  className="h-8 w-8 rounded-xl flex items-center justify-center text-white/40 hover:text-[#D45B5B] hover:bg-white/10 transition-all shrink-0"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Expand/Collapse toggle */}
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className={cn(
              "flex items-center h-9 w-full rounded-2xl text-white/30 hover:text-white hover:bg-white/10 transition-all duration-200",
              sidebarExpanded ? "gap-2 px-3 justify-start" : "justify-center px-0"
            )}
            title={sidebarExpanded ? "Collapse menu" : "Expand menu"}
          >
            {sidebarExpanded
              ? <><ChevronLeft className="h-4 w-4 shrink-0" /><span className="text-xs whitespace-nowrap">Collapse</span></>
              : <ChevronRight className="h-4 w-4 shrink-0" />
            }
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className={cn(
        "transition-all duration-300 print:ml-0",
        sidebarExpanded ? "md:ml-[236px]" : "md:ml-[88px]"
      )}>
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-50 bg-[#1F1F21] h-14 flex items-center justify-between px-4 rounded-b-2xl">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-[#FFD528] flex items-center justify-center">
              <Calculator className="h-4 w-4 text-[#1F1F21]" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">CrewRate</span>
          </Link>
          <button
            className="h-10 w-10 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#1F1F21] px-4 pb-4 space-y-1 rounded-b-2xl -mt-px z-40 relative">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link key={path} to={path} onClick={() => setMobileMenuOpen(false)}>
                  <div
                    className={cn(
                      "flex items-center gap-3 h-11 px-3 rounded-2xl transition-all",
                      isActive
                        ? "bg-[#FFD528] text-[#1F1F21] font-semibold"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                </Link>
              );
            })}
            <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
              <div
                className={cn(
                  "flex items-center gap-3 h-11 px-3 rounded-2xl transition-all",
                  location.pathname === '/settings'
                    ? "bg-[#FFD528] text-[#1F1F21] font-semibold"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                )}
              >
                <Settings className="h-5 w-5" />
                <span className="text-sm font-medium">Settings</span>
              </div>
            </Link>
            <div className="border-t border-white/10 pt-2 mt-2">
              <button
                onClick={() => { setMobileMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-[#D45B5B] hover:bg-white/10 rounded-2xl transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
