import { useState, type FormEvent } from 'react';
import { Scissors } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import { ErroApi } from '../api/cliente';
import { Botao } from '../ui/Botao';
import { Campo } from '../ui/Campo';
import './telas.css';

export function Entrar(): JSX.Element {
  const { entrar, registrar } = useAuth();
  const [modo, setModo] = useState<'entrar' | 'registrar'>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') await entrar(email.trim(), senha);
      else await registrar(nome.trim(), email.trim(), senha, codigo.trim());
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
          <Campo
            rotulo="Nome"
            type="text"
            autoComplete="name"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
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
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          required
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        {modo === 'registrar' && (
          <Campo
            rotulo="Código de convite"
            type="text"
            autoComplete="off"
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        )}

        {erro !== null && <p className="aviso-erro">{erro}</p>}

        <Botao variante="primario" type="submit" bloco disabled={enviando}>
          {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
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
