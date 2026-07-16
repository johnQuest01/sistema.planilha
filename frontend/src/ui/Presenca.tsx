import { useEffect, useRef, useState } from 'react';
import { LogIn } from 'lucide-react';
import { api } from '../api/cliente';
import { useAuth } from '../contexto/Auth';
import './presenca.css';

// Presença "ao vivo" por polling: consulta a cada ~20s quem está online e as entradas
// (logins) recentes, mostrando a lista fixa e avisos "Fulano entrou".
const INTERVALO_MS = 20000;
const AVISO_MS = 6000;

interface Online {
  id: string;
  nome: string;
}
interface Aviso {
  id: string;
  texto: string;
}

export function Presenca(): JSX.Element | null {
  const { estado } = useAuth();
  const logado = estado.fase === 'logado';
  const meuId = estado.fase === 'logado' ? estado.usuario.id : null;

  const [online, setOnline] = useState<Online[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  // null = ainda não semeado. Na 1ª consulta guardamos as entradas atuais SEM avisar,
  // para não disparar uma enxurrada de logins antigos ao abrir o app.
  const vistasRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!logado) {
      setOnline([]);
      setAvisos([]);
      vistasRef.current = null;
      return undefined;
    }

    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick(): Promise<void> {
      try {
        const p = await api.presenca();
        if (!vivo) return;
        setOnline(p.online);

        const vistas = vistasRef.current;
        if (vistas === null) {
          vistasRef.current = new Set(p.entradas.map((e) => e.id));
        } else {
          const novos = p.entradas.filter((e) => !vistas.has(e.id) && e.usuarioId !== meuId);
          for (const e of novos) vistas.add(e.id);
          if (novos.length > 0) {
            const ordenados = [...novos].reverse(); // mais antigo primeiro
            setAvisos((atual) => [
              ...atual,
              ...ordenados.map((e) => ({ id: e.id, texto: `${e.nome} entrou` })),
            ]);
            for (const e of ordenados) {
              setTimeout(() => {
                if (vivo) setAvisos((atual) => atual.filter((a) => a.id !== e.id));
              }, AVISO_MS);
            }
          }
        }
      } catch {
        /* rede/401: ignora e tenta no próximo ciclo */
      } finally {
        if (vivo) timer = setTimeout(() => void tick(), INTERVALO_MS);
      }
    }

    void tick();
    return () => {
      vivo = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [logado, meuId]);

  if (!logado) return null;

  const nomes = online.map((o) => (o.id === meuId ? `${o.nome} (você)` : o.nome));

  return (
    <>
      {avisos.length > 0 && (
        <div className="presenca-avisos" aria-live="polite">
          {avisos.map((a) => (
            <div key={a.id} className="presenca-aviso">
              <LogIn size={16} />
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}
      {online.length > 0 && (
        <div className="presenca-online" title={nomes.join(', ')}>
          <span className="presenca-online__dot" />
          <span className="presenca-online__txt">
            {online.length} online · {nomes.join(', ')}
          </span>
        </div>
      )}
    </>
  );
}
