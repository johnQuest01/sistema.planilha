import { useEffect, useState } from 'react';

// Placeholder da Fase 1. As telas reais (8.1/8.2/8.3) e o design system entram na Fase 4.
// Aqui só confirmamos que o frontend fala com o backend via proxy do Vite.
export function App() {
  const [saude, setSaude] = useState<string>('checando…');

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((j: { status?: string; db?: boolean }) =>
        setSaude(`backend: ${j.status ?? '?'} · db: ${j.db === true ? 'ok' : 'falhou'}`),
      )
      .catch(() => setSaude('backend offline'));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Mostruário</h1>
      <p>Fase 1 — fundação no ar.</p>
      <p>{saude}</p>
    </main>
  );
}
