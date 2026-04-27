import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ProUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  description?: string;
}

export function ProUpgradeDialog({
  open, onOpenChange, featureName, description,
}: ProUpgradeDialogProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="w-10 h-10 bg-[#FFD528]/10 rounded-xl flex items-center justify-center mx-auto mb-1">
            <Lock className="h-5 w-5 text-[#FFD528]" />
          </div>
          <DialogTitle className="text-base">{featureName} is a Pro feature</DialogTitle>
          <DialogDescription>
            {description || 'Upgrade to Pro to unlock this feature.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            className="w-full bg-[#FFD528] text-[#1F1F21] font-bold hover:bg-[#FFD528]/90"
            onClick={() => navigate('/settings', { state: { section: 'billing' } })}
          >
            Upgrade to Pro
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
