import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Home } from './pages/Home';
import { Workspace } from './pages/Workspace';
import { Experiment } from './pages/Experiment';
import { Method } from './pages/Method';

function useRoute() {
  const [h, setH] = useState(() => location.hash || '#/');
  useEffect(() => {
    const f = () => { setH(location.hash || '#/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h.replace(/^#/, '');
}

function ThemeToggle() {
  const [t, setT] = useState<string | null>(() => { try { return localStorage.getItem('mcm.theme'); } catch { return null; } });
  useEffect(() => {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    try { if (t) localStorage.setItem('mcm.theme', t); else localStorage.removeItem('mcm.theme'); } catch {}
  }, [t]);
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  return <button className="theme-btn" onClick={() => setT(dark ? 'light' : 'dark')} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}>{dark ? '☀' : '☾'}</button>;
}

function App() {
  const route = useRoute();
  const [, page, arg] = route.split('/');
  const nav = [['', 'Início'], ['cenario/E01', 'Cenário'], ['experimento', 'Experimento'], ['metodo', 'Método']];
  const current = page === 'cenario' ? 'cenario/E01' : page ?? '';
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--ink)" /><path d="M5 21c4-3 7 3 11 0s7 3 11 0" fill="none" stroke="#5fb4c9" strokeWidth="2.2" strokeLinecap="round" /><circle cx="10" cy="11" r="2.6" fill="#e2a13b" /><circle cx="22" cy="9" r="2.6" fill="var(--paper)" /><path d="M10 11 22 9" stroke="var(--paper)" strokeWidth="1.4" /></svg>
          <span className="brand-name">Memória Climática Municipal</span>
        </a>
        <span className="badge-fict">Dados fictícios · experimental</span>
        <nav className="nav" aria-label="Seções">
          {nav.map(([k, l]) => <a key={k} href={`#/${k}`} aria-current={current === k ? 'page' : undefined}>{l}</a>)}
        </nav>
        <ThemeToggle />
      </header>
      <main>
        {page === 'cenario' ? <Workspace id={arg || 'E01'} /> : page === 'experimento' ? <Experiment /> : page === 'metodo' ? <Method /> : <Home />}
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
