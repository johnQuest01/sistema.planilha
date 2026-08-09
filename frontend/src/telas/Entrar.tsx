import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Scissors } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import { ErroApi } from '../api/cliente';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import './telas.css';

type ModoCadastro = 'nova' | 'token';

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

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') {
        await entrar(email.trim(), senha);
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
          onChange={(e) => setEmail(e.target.value)}
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
            sem misturar com outras contas.
          </p>
        )}

        {erro !== null && <p className="aviso-erro">{erro}</p>}

        <Botao variante="primario" type="submit" bloco disabled={enviando}>
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
            }}
          >
            {modo === 'entrar' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </form>
    </div>
  );
}
