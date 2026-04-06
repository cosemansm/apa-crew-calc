import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Project {
  id: string;
  name: string;
  client_name: string | null;
}

interface JobLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onDeleted: (id: string) => void;
  onProceed: () => void;
}

export function JobLimitDialog({
  open, onOpenChange, projects, onDeleted, onProceed,
}: JobLimitDialogProps) {
  const navigate = useNavigate();
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Sync local list when dialog opens so it always reflects latest state
  useEffect(() => {
    if (open) setLocalProjects(projects);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const slotsFreed = projects.length - localProjects.length;
  const canProceed = localProjects.length < 10;

  const handleDelete = async (project: Project) => {
    if (!confirm(`Delete "${project.name}" and all its days? This cannot be undone.`)) return;
    setDeleting(project.id);
    await supabase.from('project_days').delete().eq('project_id', project.id);
    await supabase.from('projects').delete().eq('id', project.id);
    setLocalProjects(prev => prev.filter(p => p.id !== project.id));
    onDeleted(project.id);
    setDeleting(null);
  };

  const handleProceed = () => {
    onOpenChange(false);
    onProceed();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>You've reached the 10-job limit</DialogTitle>
          <DialogDescription>
            Remove a job below to free a slot, then continue.
            {slotsFreed > 0 && (
              <span className="block mt-1 text-foreground font-medium">
                {slotsFreed} slot{slotsFreed > 1 ? 's' : ''} freed — you can now add {slotsFreed} new job{slotsFreed > 1 ? 's' : ''}.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Job count indicator */}
        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className="px-2 py-0.5 rounded-md text-xs font-mono"
            style={{ background: localProjects.length >= 10 ? '#FEE2E2' : '#F0FDF4', color: localProjects.length >= 10 ? '#B91C1C' : '#15803D' }}
          >
            {localProjects.length} / 10
          </span>
          <span className="text-muted-foreground">jobs used</span>
        </div>

        {/* Job list */}
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {localProjects.map(project => (
            <div
              key={project.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{project.name}</p>
                {project.client_name && (
                  <p className="text-xs text-muted-foreground truncate">{project.client_name}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                disabled={deleting === project.id}
                onClick={() => handleDelete(project)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => { onOpenChange(false); navigate('/settings'); }}
          >
            <Sparkles className="h-4 w-4" /> Upgrade to Pro
          </Button>
          <Button
            className="flex-1"
            disabled={!canProceed}
            onClick={handleProceed}
          >
            Add New Job →
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
