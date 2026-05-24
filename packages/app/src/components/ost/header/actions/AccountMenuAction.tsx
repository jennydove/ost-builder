import { useEffect, useMemo, useState } from 'react';
import { LogIn, LogOut, User, FolderOpen, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase, supabaseConfigured } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export function AccountMenuAction() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const initials = useMemo(() => {
    const name = (user?.user_metadata.full_name as string) || (user?.user_metadata.name as string) || user?.email || '';
    return name.trim().slice(0, 1).toUpperCase();
  }, [user]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    // Get initial session
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes (handles OAuth callback automatically)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ title: 'Logout failed', description: error.message, variant: 'destructive' });
    } else {
      setUser(null);
      toast({ title: 'Signed out' });
    }
  };

  if (!supabaseConfigured || loading) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Account menu">
          <Avatar className="h-8 w-8 border border-border">
            {user?.user_metadata.avatar_url ? (
              <AvatarImage src={user.user_metadata.avatar_url as string} alt="User avatar" />
            ) : null}
            <AvatarFallback className="text-xs">
              {user ? initials || <User className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {user
            ? ((user.user_metadata.full_name as string) || user.email || 'Signed in')
            : 'Not signed in'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!user ? (
          <DropdownMenuItem onClick={() => void handleLogin()}>
            <LogIn className="w-4 h-4 mr-2" />
            Sign in with Google
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={() => navigate('/library')}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Manage shares
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Key className="w-4 h-4 mr-2" />
              API tokens
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
