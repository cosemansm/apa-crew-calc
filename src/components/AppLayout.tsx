import { Link, Outlet, useLocation } from 'react-router-dom';
import { Calculator, History, FileText, LogOut, Sparkles, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/calculator', label: 'Calculator', icon: Calculator },
  { path: '/ai-input', label: 'AI Input', icon: Sparkles },
  { path: '/history', label: 'History', icon: History },
  { path: '/invoices', label: 'Invoices', icon: FileText },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/calculator" className="flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">CrewRate</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link key={path} to={path}>
                <Button
                  variant={location.pathname === path ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(location.pathname === path && 'bg-secondary')}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {label}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t p-4 space-y-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link key={path} to={path} onClick={() => setMobileMenuOpen(false)}>
                <Button
                  variant={location.pathname === path ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {label}
                </Button>
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
