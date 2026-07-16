import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, Shuffle } from 'lucide-react';
import { api, ErroApi } from '../api/cliente';
import { useAuth } from '../contexto/Auth';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import { TopoApp } from './TopoApp';
import './telas.css';

// Gera um código no formato MOST-XXXX-XXXX (sem caracteres ambíguos).
function gerarCodigo(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return `MOST-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

export function Config(): JSX.Element {
  const { estado } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [salvo, setSalvo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Só o dono usa esta tela. Membro que digitar /config volta pro início.
  if (estado.fase === 'logado' && estado.usuario.papel !== 'dono') {
    return <Navigate to="/" replace />;
  }

  async function salvar(): Promise<void> {
    const limpo = codigo.trim();
    if (limpo.length < 4) {
      setErro('o código precisa ter ao menos 4 caracteres');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await api.definirCodigoConvite(limpo);
      setSalvo(limpo);
      setCodigo('');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="pagina">
      <TopoApp />
      <div className="faixa">
        <div className="config">
          <h1 className="config__titulo">
            <KeyRound size={20} />
            Código de convite
          </h1>
          <p className="config__ajuda">
            Quem for criar conta precisa digitar este código. Por segurança, o código atual
            não é exibido — defina um novo abaixo quando quiser trocá-lo.
          </p>

          {salvo !== null && (
            <div className="config__salvo">
              <span className="config__salvo-rotulo">Novo código salvo:</span>
              <code className="config__salvo-codigo">{salvo}</code>
              <button
                type="button"
                className="link-texto"
                onClick={() => void navigator.clipboard?.writeText(salvo)}
              >
                copiar
              </button>
            </div>
          )}

          <div className="config__forma">
            <Campo
              rotulo="Novo código"
              placeholder="ex.: MOST-AB12-CD34"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
            <div className="config__acoes">
              <Botao variante="fantasma" onClick={() => setCodigo(gerarCodigo())}>
                <Shuffle size={16} />
                Gerar aleatório
              </Botao>
              <Botao
                variante="primario"
                onClick={() => void salvar()}
                disabled={salvando || codigo.trim().length < 4}
              >
                Salvar código
              </Botao>
            </div>
            {erro !== null && <p className="aviso-erro">{erro}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
