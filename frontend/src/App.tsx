import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProvedorAuth, useAuth } from './contexto/Auth';
import { Entrar } from './telas/Entrar';
import { Inicio } from './telas/Inicio';
import { Colecao } from './telas/Colecao';
import { Config } from './telas/Config';
import { Carregando } from './ui/Carregando';

function Protegida({ children }: { children: JSX.Element }): JSX.Element {
  const { estado } = useAuth();
  if (estado.fase === 'carregando') return <Carregando />;
  if (estado.fase === 'deslogado') return <Navigate to="/entrar" replace />;
  return children;
}

function Rotas(): JSX.Element {
  const { estado } = useAuth();
  return (
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <ProvedorAuth>
        <Rotas />
      </ProvedorAuth>
    </BrowserRouter>
  );
}
