import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Scissors } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import { api, ErroApi } from '../api/cliente';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import './telas.css';

type ModoCadastro = 'nova' | 'token';

type PreviaToken =
  | { fase: 'idle' }
  | { fase: 'checando' }
  | { fase: 'ok'; contaNome: string }
  | { fase: 'invalido' };

type PreviaPedido =
  | { fase: 'idle' }
  | { fase: 'enviando' }
  | { fase: 'ok'; contaNome: string; status: 'pendente' | 'ativo'; nome: string }
  | { fase: 'erro'; msg: string };

function tokenPareceCompleto(t: string): boolean {
  const s = t.trim().toUpperCase();
  // MOST-XXXX-XXXX ou código legado ≥ 4
  return /^MOST-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(s) || (s.length >= 8 && !s.includes(' '));
}

export function Entrar(): JSX.Element {
  const { entrar, registrar } = useAuth();
  const [modo, setModo] = useState<'entrar' | 'registrar'>('entrar');
  const [modoCadastro, setModoCadastro] = useState<ModoCadastro>('token');
  const [nome, setNome] = useState('');
  const [nomeConta, setNomeConta] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [token, setToken] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [previaToken, setPreviaToken] = useState<PreviaToken>({ fase: 'idle' });
  const [previaPedido, setPreviaPedido] = useState<PreviaPedido>({ fase: 'idle' });
  const pedidoKeyRef = useRef('');

  // Login inteligente: valida o token enquanto digita (antes do Entrar).
  useEffect(() => {
    if (modo !== 'entrar') {
      setPreviaToken({ fase: 'idle' });
      return undefined;
    }
    const t = token.trim();
    if (!tokenPareceCompleto(t)) {
      setPreviaToken({ fase: 'idle' });
      return undefined;
    }
    let vivo = true;
    setPreviaToken({ fase: 'checando' });
    const timer = setTimeout(() => {
      void api
        .olharToken(t)
        .then((r) => {
          if (!vivo) return;
          if (r.valido && r.contaNome !== null) {
            setPreviaToken({ fase: 'ok', contaNome: r.contaNome });
          } else {
            setPreviaToken({ fase: 'invalido' });
          }
        })
        .catch(() => {
          if (vivo) setPreviaToken({ fase: 'idle' });
        });
    }, 450);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [token, modo]);

  // Com e-mail + token válidos: já cria o pedido e avisa o admin (antes do Entrar).
  useEffect(() => {
    if (modo !== 'entrar') {
      setPreviaPedido({ fase: 'idle' });
      return undefined;
    }
    const em = email.trim().toLowerCase();
    const t = token.trim();
    if (!em.includes('@') || !tokenPareceCompleto(t) || previaToken.fase !== 'ok') {
      return undefined;
    }
    const chave = `${em}|${t.toUpperCase()}`;
    if (chave === pedidoKeyRef.current && previaPedido.fase === 'ok') return undefined;

    let vivo = true;
    setPreviaPedido({ fase: 'enviando' });
    const timer = setTimeout(() => {
      void api
        .prePedido(em, t)
        .then((r) => {
          if (!vivo) return;
          pedidoKeyRef.current = chave;
          setPreviaPedido({
            fase: 'ok',
            contaNome: r.contaNome,
            status: r.status,
            nome: r.nome,
          });
        })
        .catch((e) => {
          if (!vivo) return;
          setPreviaPedido({
            fase: 'erro',
            msg: e instanceof ErroApi ? e.message : 'não foi possível enviar o pedido',
          });
        });
    }, 700);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
    // previaPedido.fase de propósito fora: só reage a email/token/previaToken
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, token, modo, previaToken]);

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') {
        await entrar(email.trim(), senha, token.trim() || undefined);
      } else if (modoCadastro === 'token') {
        await registrar({
          nome: nome.trim(),
          email: email.trim(),
          senha,
          token: token.trim(),
        });
      } else {
        await registrar({
          nome: nome.trim(),
          email: email.trim(),
          senha,
          nomeConta: nomeConta.trim() || undefined,
        });
      }
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : 'não foi possível continuar');
      setEnviando(false);
    }
  }

  return (
    <div className="entrar">
      <form className="entrar__cartao" onSubmit={enviar}>
        <div className="entrar__marca">
          <Scissors size={22} />
          Mostruário
        </div>

        {modo === 'registrar' && (
          <div className="entrar__modos" role="group" aria-label="Tipo de cadastro">
            <button
              type="button"
              className={`entrar__modo${modoCadastro === 'token' ? ' entrar__modo--ativo' : ''}`}
              onClick={() => setModoCadastro('token')}
            >
              Tenho um token
            </button>
            <button
              type="button"
              className={`entrar__modo${modoCadastro === 'nova' ? ' entrar__modo--ativo' : ''}`}
              onClick={() => setModoCadastro('nova')}
            >
              Criar minha conta
            </button>
          </div>
        )}

        {modo === 'registrar' && (
          <Campo
            rotulo="Seu nome"
            type="text"
            autoComplete="name"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        )}
        {modo === 'registrar' && modoCadastro === 'nova' && (
          <Campo
            rotulo="Nome da sua conta (opcional)"
            type="text"
            autoComplete="organization"
            placeholder="ex.: Oficina do João"
            value={nomeConta}
            onChange={(e) => setNomeConta(e.target.value)}
          />
        )}
        <Campo
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            pedidoKeyRef.current = '';
          }}
        />
        <div className="entrar__senha">
          <Campo
            rotulo="Senha"
            type={mostrarSenha ? 'text' : 'password'}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <button
            type="button"
            className="entrar__olho"
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            onClick={() => setMostrarSenha((v) => !v)}
          >
            {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {modo === 'entrar' && (
          <>
            <Campo
              rotulo="Token do admin (opcional)"
              type="text"
              autoComplete="off"
              placeholder="MOST-XXXX-XXXX"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                pedidoKeyRef.current = '';
              }}
            />
            {previaToken.fase === 'checando' && (
              <p className="entrar__dica">Verificando token…</p>
            )}
            {previaToken.fase === 'ok' && (
              <p className="entrar__ok">
                Token válido — conta <strong>{previaToken.contaNome}</strong>
              </p>
            )}
            {previaToken.fase === 'invalido' && (
              <p className="aviso-erro">Token inválido, expirado ou já usado</p>
            )}
            {previaPedido.fase === 'enviando' && (
              <p className="entrar__dica">Enviando pedido ao admin…</p>
            )}
            {previaPedido.fase === 'ok' && previaPedido.status === 'pendente' && (
              <p className="entrar__ok">
                Pedido enviado para <strong>{previaPedido.contaNome}</strong> com o login{' '}
                <strong>{email.trim().toLowerCase()}</strong>. O admin já foi avisado — digite a
                senha e entre (sua conta continua intacta).
              </p>
            )}
            {previaPedido.fase === 'ok' && previaPedido.status === 'ativo' && (
              <p className="entrar__ok">
                Acesso a <strong>{previaPedido.contaNome}</strong> já liberado. Entre com a senha.
              </p>
            )}
            {previaPedido.fase === 'erro' && (
              <p className="aviso-erro">{previaPedido.msg}</p>
            )}
            {previaToken.fase === 'idle' && previaPedido.fase === 'idle' && (
              <p className="entrar__dica">
                Já tem conta? Cole o token do admin — o sistema valida e avisa o admin com o seu
                e-mail <em>antes</em> de você clicar em Entrar.
              </p>
            )}
          </>
        )}
        {modo === 'registrar' && modoCadastro === 'token' && (
          <Campo
            rotulo="Token de convite"
            type="text"
            autoComplete="off"
            required
            placeholder="MOST-XXXX-XXXX"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        )}
        {modo === 'registrar' && modoCadastro === 'nova' && (
          <p className="entrar__dica">
            Você será o <strong>admin</strong> desta conta: planilhas, dados e tokens só seus —
            sem misturar com outras contas. Depois, no login, pode usar um token de outro admin
            para pedir acesso à conta dele.
          </p>
        )}

        {erro !== null && <p className="aviso-erro">{erro}</p>}

        <Botao
          variante="primario"
          type="submit"
          bloco
          disabled={enviando || (modo === 'entrar' && previaToken.fase === 'invalido')}
        >
          {modo === 'entrar'
            ? 'Entrar'
            : modoCadastro === 'nova'
              ? 'Criar minha conta'
              : 'Entrar com token'}
        </Botao>

        <p className="entrar__troca">
          {modo === 'entrar' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
          <button
            type="button"
            className="link-texto"
            onClick={() => {
              setModo(modo === 'entrar' ? 'registrar' : 'entrar');
              setErro(null);
              setPreviaToken({ fase: 'idle' });
              setPreviaPedido({ fase: 'idle' });
              pedidoKeyRef.current = '';
            }}
          >
            {modo === 'entrar' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </form>
    </div>
  );
}
