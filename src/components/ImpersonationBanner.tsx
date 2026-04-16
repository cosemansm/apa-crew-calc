import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useNavigate } from 'react-router-dom';
import { X, RefreshCw } from 'lucide-react';

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedData, impersonationLoading, stopImpersonation, refreshImpersonation } = useImpersonation();
  const navigate = useNavigate();

  if (!isImpersonating || !impersonatedData) return null;

  return (
    <>
      {/* Red border — 4px on all edges using box-shadow on a fixed overlay */}
      <div
        className="fixed inset-0 z-[9999] pointer-events-none"
        style={{ boxShadow: 'inset 0 0 0 4px #D45B5B' }}
      />
      {/* Banner */}
      <div className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-3 bg-[#D45B5B] text-white text-sm font-mono py-2 px-4">
        <span>
          Viewing as <strong>{impersonatedData.displayName || impersonatedData.email}</strong>
          {impersonatedData.displayName && (
            <span className="opacity-60 ml-1">({impersonatedData.email})</span>
          )}
        </span>
        <button
          onClick={refreshImpersonation}
          disabled={impersonationLoading}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40"
          title="Refresh snapshot"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${impersonationLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={() => {
            stopImpersonation();
            navigate('/admin/users');
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold uppercase tracking-wider transition-all"
        >
          <X className="h-3.5 w-3.5" />
          End Session
        </button>
      </div>
    </>
  );
}
