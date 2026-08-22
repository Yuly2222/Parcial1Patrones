import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

// El fix de íconos de Leaflet se importa dentro de OperadorDashboard (no
// aquí) para que Leaflet no entre en el bundle inicial del ciudadano.

const root = document.getElementById('root')!;

// `./App` importa (transitivamente) supabaseClient.ts, que lanza un error
// al evaluarse si faltan las variables VITE_SUPABASE_*. Un import estático
// normal dejaría la página en blanco sin ninguna pista (el error solo se ve
// en la consola del navegador). Con import() dinámico + catch, mostramos un
// mensaje legible directamente en la página.
import('./App')
  .then(({ default: App }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((error: unknown) => {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido al iniciar la app';
    root.innerHTML = `
      <div style="max-width:560px;margin:3rem auto;padding:1.5rem;font-family:system-ui,sans-serif;line-height:1.5">
        <h1 style="color:#b3261e">No se pudo iniciar la app</h1>
        <p>${mensaje}</p>
        <p>Copia <code>frontend/.env.example</code> a <code>frontend/.env.local</code>, complétalo con tus
        valores reales y reinicia <code>npm run dev</code>.</p>
      </div>`;
  });
