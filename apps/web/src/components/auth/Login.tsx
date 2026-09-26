import { Button } from "#/ui/Button";
import { authenticate } from '../../auth/client';
import { useState } from 'react';

export function Login() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-col items-center border-2 dark:border-zinc-300 rounded p-8 dark:bg-zinc-800">
      <div className="w-60 flex flex-col">
        <Button className="bg-[#9146FF] rounded-none"
        isDisabled={pending}
        onPress={async () => {
          setPending(true); setError('');
          try { await authenticate('signin/twitch'); }
          catch { setError('Could not sign in. Please try again.'); setPending(false); }
        }}>{pending ? 'Signing in…' : 'Login With Twitch'}</Button>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  )
}
