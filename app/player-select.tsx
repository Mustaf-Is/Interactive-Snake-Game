"use client";

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Player } from '@/lib/player-session';

export default function PlayerSelect({player, disabled, onChange, onBusyChange}: {player: Player | null; disabled: boolean; onChange: (player: Player | null, initial?: boolean) => void; onBusyChange: (busy: boolean) => void}) {
  const [mode, setMode] = useState<'register' | 'login' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const password = useRef<HTMLInputElement>(null);
  const restore = useEffectEvent(onChange);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/player', {cache: 'no-store', signal: controller.signal}).then(async response => {
      if (!response.ok) throw Error('Player services are unavailable. Guest play is still available.');
      return response.json() as Promise<{player: Player | null}>;
    }).then(data => {if (!controller.signal.aborted) restore(data.player, true);}).catch(error => {if (!controller.signal.aborted) setError(error.message);});
    return () => controller.abort();
  }, []);
  // A start may create a guest while the initial player read is in flight.
  // The game owns the active identity, and controls stay locked during runs.
  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled || !mode) return;
    const values = new FormData(event.currentTarget);
    setBusy(true); onBusyChange(true); setError('');
    try {
      const response = await fetch('/api/player', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: mode, username: values.get('username'), password: values.get('password')})});
      const data = await response.json() as {player: Player; error?: string};
      if (!response.ok) throw Error(data.error ?? 'Unable to select this player. Please retry.');
      onChange(data.player); setMode(null);
    } catch (error) {setError(error instanceof Error ? error.message : 'Unable to select this player. Please retry.');}
    finally {if (password.current) password.current.value = ''; setBusy(false); onBusyChange(false);}
  }
  async function signOut() {
    if (busy || disabled) return;
    setBusy(true); onBusyChange(true); setError('');
    try {
      const response = await fetch('/api/player', {method: 'DELETE'});
      if (!response.ok) throw Error('Unable to sign out. Please retry.');
      onChange(null); setMode(null);
    } catch (error) {setError(error instanceof Error ? error.message : 'Unable to sign out. Please retry.');}
    finally {setBusy(false); onBusyChange(false);}
  }
  return <section className="player-select" aria-label="Player select">
    <div className="player-display"><span>PLAYER SELECT</span><strong>{player?.username ?? 'GUEST MODE'}</strong><small>{player?.guest ? 'Guest records stay with this browser for 30 days.' : player ? 'Your name. Your high scores.' : 'No account needed. Press Start to play as a guest.'}</small></div>
    <fieldset disabled={busy || disabled}>
      <legend className="sr-only">Player options</legend>
      {player && !player.guest ? <button type="button" onClick={() => void signOut()}>Sign out</button> : <div className="player-actions">
        <button type="button" aria-expanded={mode === 'register'} onClick={() => {setMode('register'); setError('');}}>New player</button>
        <button type="button" aria-expanded={mode === 'login'} onClick={() => {setMode('login'); setError('');}}>Returning player</button>
        {mode && <button type="button" onClick={() => {setMode(null); setError('');}}>Continue as guest</button>}
      </div>}
      {mode && <form onSubmit={event => void authenticate(event)} className="player-form">
        <label htmlFor="player-name">Player name<input id="player-name" name="username" autoComplete="username" minLength={3} maxLength={16} pattern="[a-zA-Z0-9_]+" required aria-describedby="player-help"/></label>
        <label htmlFor="player-password">Password<input ref={password} id="player-password" name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 15 : 1} maxLength={128} required aria-describedby="player-help"/></label>
        <p id="player-help">{mode === 'register' ? '3–16 letters, numbers or underscores. Password: 15+ characters. No email or password recovery; keep it somewhere safe. Guest scores stay with the guest player.' : 'Use your player name and password to bring back your records.'}</p>
        <button type="submit">{busy ? 'Connecting…' : mode === 'register' ? 'Create player' : 'Sign in'}</button>
      </form>}
    </fieldset>
    {disabled && <p className="saved-note">Finish and save this run before switching players.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
