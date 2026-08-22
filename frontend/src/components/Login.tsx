import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

export function Login() {
  const [modoOperador, setModoOperador] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrarComoCiudadano() {
    setError(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setError(error.message);
    setEnviando(false);
  }

  async function entrarComoOperador(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setEnviando(false);
  }

  if (modoOperador) {
    return (
      <div className="pantalla-login">
        <form className="tarjeta login-form" onSubmit={entrarComoOperador}>
          <h2>Acceso de operador</h2>
          <label>
            Correo
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="mensaje-error">{error}</p>}
          <button type="submit" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
          <button type="button" className="boton-link" onClick={() => setModoOperador(false)}>
            ← Volver
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="pantalla-login">
      <div className="tarjeta login-landing">
        <h1>Emergencias 2026</h1>
        <p className="subtitulo">Chocó · Pereira · Cali · Manizales</p>
        <button onClick={entrarComoCiudadano} disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Soy ciudadano — reportar emergencia'}
        </button>
        <button className="secundario" onClick={() => setModoOperador(true)}>
          Soy operador de un organismo
        </button>
        {error && <p className="mensaje-error">{error}</p>}
      </div>
    </div>
  );
}
