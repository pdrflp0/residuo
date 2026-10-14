import { AlertTriangle } from 'lucide-react';
import { getAbout } from './api';
import { CompareView } from './components/CompareView';
import { Home } from './components/Home';
import { RunView } from './components/RunView';
import { useMotion, useResource, useRoute } from './hooks';

export function App() {
  const route = useRoute();
  const motion = useMotion();
  const about = useResource(getAbout, []);

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="shell">
        <header className="topbar">
          <a className="brand" href="#/" aria-label="Resíduo — início">
            <Logo />
            <span className="brand-name">Resíduo</span>
            <span className="brand-tag">laboratório de reaparecimento de registros</span>
          </a>
          <span className="topbar-spacer" />
          <span className="demo-badge" title="Todos os dados são sintéticos e o alvo é o serviço de referência local">
            demo · dados sintéticos
          </span>
          <label className="toggle">
            <input type="checkbox" checked={motion.enabled} onChange={(e) => motion.setEnabled(e.target.checked)} />
            Animações
          </label>
        </header>

        {about.error && (
          <div className="alert error" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>API do Resíduo indisponível. Suba o ambiente com <code>npm run dev</code> (ver README).</span>
          </div>
        )}
        {about.data && !about.data.reference.reachable && (
          <div className="alert warn" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              O serviço de referência não respondeu. Execuções agora terminariam como <strong>INCONCLUSIVE</strong>, não como aprovação.
            </span>
          </div>
        )}

        <main id="conteudo">
          {route.name === 'home' && <Home />}
          {route.name === 'run' && <RunView key={route.id} id={route.id} motion={motion.enabled} />}
          {route.name === 'compare' && <CompareView base={route.base} candidate={route.candidate} />}
        </main>

        <footer className="footer">
          <span>
            Mede visibilidade pela API de leitura do alvo, dentro dos limites do adapter. Não é certificação de privacidade nem prova de apagamento físico.
          </span>
          <span className="mono">
            engine v{about.data?.engineVersion ?? '—'} · adapter {about.data?.adapter.name ?? '—'}
          </span>
        </footer>
      </div>
    </>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1B1A17" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#F5F3EE" strokeWidth="2.4" strokeDasharray="3.2 3.2" />
      <circle cx="16" cy="16" r="3.4" fill="#E0533F" />
    </svg>
  );
}
