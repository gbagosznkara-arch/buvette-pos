import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { supabaseConfigured } from '@/lib/supabase';
import './index.css';

function MissingConfig() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl bg-white p-6 shadow-sm border border-slate-200 text-slate-700">
        <h1 className="text-lg font-semibold text-slate-900 mb-2">Configuration manquante</h1>
        <p className="text-sm">
          Les variables d'environnement <code>VITE_SUPABASE_URL</code> et{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> ne sont pas définies. Ajoutez-les dans les
          paramètres du site Netlify puis relancez un déploiement.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigured ? <App /> : <MissingConfig />}
  </StrictMode>
);
