import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';

type Props = {
  redirectTo?: string;
  size?: 'sm' | 'default';
  className?: string;
};

export function SignInButtons({ redirectTo, size = 'default', className = '' }: Props) {
  const [mode, setMode] = useState<'pick' | 'email'>('pick');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleGoogle = () => {
    void supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo ?? window.location.href },
    });
  };

  const handleEmail = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo ?? window.location.href },
        });
        if (error) throw error;
        toast({ title: 'Check your email', description: 'Click the confirmation link to finish signing up.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      toast({ title: isSignUp ? 'Sign up failed' : 'Sign in failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'pick') {
    return (
      <div className={`space-y-2 ${className}`}>
        <Button variant="outline" size={size} className="w-full" onClick={handleGoogle}>
          Sign in with Google
        </Button>
        <Button variant="ghost" size={size} className="w-full text-muted-foreground" onClick={() => setMode('email')}>
          Sign in with email
        </Button>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleEmail(); }}
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleEmail(); }}
      />
      <Button size={size} className="w-full" onClick={() => void handleEmail()} disabled={loading || !email.trim() || !password}>
        {loading ? 'Working...' : isSignUp ? 'Sign up' : 'Sign in'}
      </Button>
      <div className="flex items-center justify-between">
        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
        <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setMode('pick')}>
          Back
        </button>
      </div>
    </div>
  );
}
