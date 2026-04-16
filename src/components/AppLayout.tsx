import { Link, Outlet, useLocation } from 'react-router-dom';
import { FileText, LogOut, Sparkles, Menu, X, LayoutDashboard, Settings, User, ChevronLeft, ChevronRight, FolderOpen, LifeBuoy, BarChart2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { cn } from '@/lib/utils';
import logoSrc from '@/assets/logo.png';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { useImpersonation } from '@/contexts/ImpersonationContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
  { path: '/ai-input', label: 'AI Input', icon: Sparkles },
  { path: '/invoices', label: 'Timesheets', icon: FileText },
  { path: '/support', label: 'Support', icon: LifeBuoy },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { subscription, isPremium, isTrialing, trialDaysLeft } = useSubscription();
  const isLifetime = subscription?.status === 'lifetime';
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const { isImpersonating } = useImpersonation();

  return (
    <div className="min-h-screen">
      <ImpersonationBanner />
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
          <div className="h-10 w-10 rounded-2xl bg-[#FFD528] flex items-center justify-center shrink-0 overflow-hidden">
            <img src={logoSrc} alt="Crew Dock" className="h-7 w-7 object-contain" style={{ mixBlendMode: 'multiply' }} />
          </div>
          {sidebarExpanded && (
            <span className="text-lg font-bold text-white tracking-tight whitespace-nowrap">
              Crew Dock
            </span>
          )}
        </div>

        {/* Nav items */}
        <nav aria-label="Main navigation" className="flex-1 px-3 py-2 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            const isAIInput = path === '/ai-input';
            const isDisabled = false;
            const innerDiv = (
              <div
                className={cn(
                  "flex items-center h-11 rounded-2xl transition-all duration-200",
                  sidebarExpanded ? "gap-3 px-3 justify-start" : "justify-center px-0",
                  isDisabled
                    ? "cursor-not-allowed opacity-30 text-white/60"
                    : cn(
                        "cursor-pointer",
                        isActive
                          ? "bg-[#FFD528] text-[#1F1F21]"
                          : "text-white/60 hover:text-white hover:bg-white/10"
                      )
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap font-mono flex-1">
                    {label}
                  </span>
                )}
                {sidebarExpanded && isAIInput && !isPremium && (
                  <span className="text-[10px] font-bold text-[#FFD528] opacity-80">✦</span>
                )}
              </div>
            );
            return isDisabled ? (
              <div key={path}>{innerDiv}</div>
            ) : (
              <Link key={path} to={path}>{innerDiv}</Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-4 border-t border-white/10" />

        {/* Plan status badge */}
        {sidebarExpanded && isTrialing && (
          <div className="px-3 py-1">
            <span className="text-[10px] font-bold text-[#FFD528] bg-[#FFD528]/10 border border-[#FFD528]/25 rounded-full px-2.5 py-0.5">
              Trial — {trialDaysLeft}d left
            </span>
          </div>
        )}
        {sidebarExpanded && !isPremium && !isTrialing && (
          <div className="px-3 py-1">
            <span className="text-[10px] font-bold text-white/40 bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
              Free Plan
            </span>
          </div>
        )}
        {sidebarExpanded && isLifetime && (
          <div className="px-3 py-1">
            <span className="text-[10px] font-bold text-[#c084fc] bg-purple-500/10 border border-purple-500/25 rounded-full px-2.5 py-0.5">
              Lifetime
            </span>
          </div>
        )}
        {sidebarExpanded && isPremium && !isTrialing && !isLifetime && (
          <div className="px-3 py-1">
            <span className="text-[10px] font-bold text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/25 rounded-full px-2.5 py-0.5">
              Pro Plan
            </span>
          </div>
        )}

        {/* Bottom: Admin (admin-only) + Settings + User */}
        <div className="px-3 py-3 space-y-1">
          {user?.email === 'milo.cosemans@gmail.com' && !isImpersonating && (
            <Link to="/admin">
              <div
                className={cn(
                  "flex items-center h-11 rounded-2xl transition-all duration-200 cursor-pointer",
                  sidebarExpanded ? "gap-3 px-3 justify-start" : "justify-center px-0",
                  location.pathname === '/admin'
                    ? "bg-[#FFD528] text-[#1F1F21]"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                )}
              >
                <BarChart2 className="h-5 w-5 shrink-0" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap font-mono">Admin</span>
                )}
              </div>
            </Link>
          )}
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
                <span className="text-sm font-medium whitespace-nowrap font-mono">Settings</span>
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
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {/* APA T&Cs link */}
          {sidebarExpanded && (
            <a
              href="https://www.a-p-a.net/apa-crew-terms/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-white/25 hover:text-white/50 transition-colors text-[10px] font-mono"
              title="APA Recommended Terms for Crew 2025"
            >
              <span>APA T&Cs 2025 ↗</span>
            </a>
          )}

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
        {/* Mobile — floating pill header */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 p-3 print:hidden">
          <header className="bg-[#1F1F21] rounded-2xl shadow-2xl h-14 flex items-center justify-between px-4">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-[#FFD528] flex items-center justify-center shrink-0 overflow-hidden">
                <img src={logoSrc} alt="Crew Dock" className="h-6 w-6 object-contain" style={{ mixBlendMode: 'multiply' }} />
              </div>
              <span className="text-base font-bold text-white tracking-tight">Crew Dock</span>
            </Link>
            <button
              className="h-9 w-9 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </header>

          {/* Floating dropdown below the pill */}
          {mobileMenuOpen && (
            <div className="mt-2 bg-[#1F1F21] rounded-2xl shadow-2xl p-2 space-y-0.5">
              {navItems.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path;
                const isDisabled = false;
                const innerDiv = (
                  <div className={cn(
                    "flex items-center gap-3 h-11 px-3 rounded-xl transition-all",
                    isDisabled
                      ? "cursor-not-allowed opacity-30 text-white/60"
                      : isActive
                        ? "bg-[#FFD528] text-[#1F1F21] font-semibold"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                  )}>
                    <Icon className="h-4.5 w-4.5" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                );
                return isDisabled ? (
                  <div key={path}>{innerDiv}</div>
                ) : (
                  <Link key={path} to={path} onClick={() => setMobileMenuOpen(false)}>{innerDiv}</Link>
                );
              })}

              {/* Mobile plan badge */}
              <div className="px-3 py-2">
                {isTrialing && (
                  <span className="text-[10px] font-bold text-[#FFD528] bg-[#FFD528]/10 border border-[#FFD528]/25 rounded-full px-2.5 py-0.5">
                    Trial — {trialDaysLeft}d left
                  </span>
                )}
                {!isPremium && !isTrialing && (
                  <span className="text-[10px] font-bold text-white/40 bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
                    Free Plan
                  </span>
                )}
                {isLifetime && (
                  <span className="text-[10px] font-bold text-[#c084fc] bg-purple-500/10 border border-purple-500/25 rounded-full px-2.5 py-0.5">
                    Lifetime
                  </span>
                )}
                {isPremium && !isTrialing && !isLifetime && (
                  <span className="text-[10px] font-bold text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/25 rounded-full px-2.5 py-0.5">
                    Pro Plan
                  </span>
                )}
              </div>

              <div className="border-t border-white/10 mt-1 pt-1">
                {user?.email === 'milo.cosemans@gmail.com' && !isImpersonating && (
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                    <div className={cn(
                      "flex items-center gap-3 h-11 px-3 rounded-xl transition-all",
                      location.pathname === '/admin'
                        ? "bg-[#FFD528] text-[#1F1F21] font-semibold"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                    )}>
                      <BarChart2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Admin</span>
                    </div>
                  </Link>
                )}
                <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
                  <div className={cn(
                    "flex items-center gap-3 h-11 px-3 rounded-xl transition-all",
                    location.pathname === '/settings'
                      ? "bg-[#FFD528] text-[#1F1F21] font-semibold"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  )}>
                    <Settings className="h-4 w-4" />
                    <span className="text-sm font-medium">Settings</span>
                  </div>
                </Link>
                <button
                  onClick={() => { setMobileMenuOpen(false); signOut(); }}
                  className="w-full flex items-center gap-3 h-11 px-3 text-sm text-[#D45B5B] hover:bg-white/10 rounded-xl transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Page content — offset for floating mobile header */}
        <main id="main-content" className={cn(
          "max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8 md:pt-6 pt-[88px]",
          isImpersonating && "pt-[120px] md:pt-[48px]"
        )}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
