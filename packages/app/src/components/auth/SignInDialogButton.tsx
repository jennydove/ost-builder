import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SignInButtons } from '@/components/auth/SignInButtons';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';

type Props = {
  label?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'sm' | 'default';
  redirectTo?: string;
  className?: string;
};

/**
 * Explicit "Sign in" affordance: a labelled button that opens the sign-in
 * dialog. Closes itself once a session arrives (email/password sign-in does
 * not reload the page the way the OAuth redirect does).
 */
export function SignInDialogButton({
  label = 'Sign in',
  variant = 'default',
  size = 'sm',
  redirectTo,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setOpen(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <LogIn className="w-4 h-4 mr-2" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Sign in</DialogTitle>
            <DialogDescription>
              Sign in to save trees to the cloud, share them, and connect your AI tools.
            </DialogDescription>
          </DialogHeader>
          <SignInButtons redirectTo={redirectTo} />
        </DialogContent>
      </Dialog>
    </>
  );
}
