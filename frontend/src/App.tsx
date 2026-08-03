import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProvedorAuth, useAuth } from './contexto/Auth';
import { Entrar } from './telas/Entrar';
import { Inicio } from './telas/Inicio';
import { Carregando } from './ui/Carregando';
import { BotaoLixeiraFlutuante } from './ui/BotaoLixeiraFlutuante';
import { InstalarApp } from './ui/InstalarApp';
import { Presenca } from './ui/Presenca';

// Telas pesadas (editor de planilha, imagens, tabela virtualizada, config, lixeira) saem
// do bundle inicial e só baixam quando a rota é acessada — o boot fica mais leve.
const Colecao = lazy(() => import('./telas/Colecao').then((m) => ({ default: m.Colecao })));
const Config = lazy(() => import('./telas/Config').then((m) => ({ default: m.Config })));
const Lixeira = lazy(() => import('./telas/Lixeira').then((m) => ({ default: m.Lixeira })));

function Protegida({ children }: { children: JSX.Element }): JSX.Element {
  const { estado } = useAuth();
  if (estado.fase === 'carregando') return <Carregando />;
  if (estado.fase === 'deslogado') return <Navigate to="/entrar" replace />;
  return children;
}

function Rotas(): JSX.Element {
  const { estado } = useAuth();
  return (
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route
          path="/entrar"
          element={estado.fase === 'logado' ? <Navigate to="/" replace /> : <Entrar />}
        />
        <Route
          path="/"
          element={
            <Protegida>
              <Inicio />
            </Protegida>
          }
        />
        <Route
          path="/c/:id"
          element={
            <Protegida>
              <Colecao />
            </Protegida>
          }
        />
        <Route
          path="/config"
          element={
            <Protegida>
              <Config />
            </Protegida>
          }
        />
        <Route
          path="/lixeira"
          element={
            <Protegida>
              <Lixeira />
            </Protegida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ProvedorAuth>
        <Rotas />
        <BotaoLixeiraFlutuante />
        <Presenca />
        <InstalarApp />
      </ProvedorAuth>
    </BrowserRouter>
  );
}
