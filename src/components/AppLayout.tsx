import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Calculator, History, FileText, LogOut, Sparkles, Menu, X, LayoutDashboard, Settings, User } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="glass-header sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">CrewRate</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 rounded-2xl bg-white/30 backdrop-blur-sm p-1 border border-white/20">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link key={path} to={path}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "rounded-xl transition-all duration-200 font-medium",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 mr-1.5", isActive ? "text-primary-foreground" : "")} />
                    {label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm hover:bg-white/30 transition-colors border border-white/20 bg-white/10 backdrop-blur-sm"
              >
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <span className="hidden sm:inline text-sm text-muted-foreground max-w-[140px] truncate">
                  {user?.email}
                </span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-10 w-52 rounded-2xl border border-white/20 bg-white/80 backdrop-blur-xl shadow-xl py-1 z-50">
                  <div className="px-4 py-2 border-b border-border/40">
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-white/60 transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); signOut(); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-white/60 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-xl"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden p-4 space-y-1 border-t border-white/20">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link key={path} to={path} onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start rounded-xl font-medium",
                      isActive
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {label}
                  </Button>
                </Link>
              );
            })}
            <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start rounded-xl font-medium",
                  location.pathname === '/settings'
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
