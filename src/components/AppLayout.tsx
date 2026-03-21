import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Calculator, History, FileText, LogOut, Sparkles, Menu, X, LayoutDashboard, Settings, User } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/calculator', label: 'Calculator', icon: Calculator },
  { path: '/ai-input', label: 'AI Input', icon: Sparkles },
  { path: '/history', label: 'History', icon: History },
  { path: '/invoices', label: 'Invoices', icon: FileText },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-border print:hidden z-40">
        {/* Logo */}
        <div className="flex items-center gap-2.5 h-16 px-6 border-b border-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Calculator className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">CrewRate</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link key={path} to={path}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start rounded-xl font-medium h-11 px-3",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5 mr-3 shrink-0" />
                  {label}
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border px-3 py-4 space-y-1">
          <Link to="/settings">
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start rounded-xl font-medium h-11 px-3",
                location.pathname === '/settings'
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Settings className="h-5 w-5 mr-3 shrink-0" />
              Settings
            </Button>
          </Link>

          {/* User info */}
          <div className="flex items-center gap-3 px-3 py-3 mt-2 rounded-xl bg-secondary/60">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{user?.email?.split('@')[0]}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="md:pl-64 flex-1 print:pl-0">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-50 bg-white border-b border-border h-14 flex items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Calculator className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">CrewRate</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-border p-3 space-y-1 z-40">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link key={path} to={path} onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start rounded-xl font-medium h-11",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {label}
                  </Button>
                </Link>
              );
            })}
            <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start rounded-xl font-medium h-11",
                  location.pathname === '/settings'
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Settings className="h-5 w-5 mr-3" />
                Settings
              </Button>
            </Link>
            <div className="border-t border-border pt-2 mt-2">
              <button
                onClick={() => { setMobileMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-destructive hover:bg-muted rounded-xl transition-colors"
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
