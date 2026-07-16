import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Campo, SubCampo } from '../../../shared/tipos';
import { Botao } from '../ui/Botao';
import { CampoValor } from './CampoValor';
import './secao.css';

type Linha = Record<string, unknown>;

// Um subcampo vira um "Campo" mínimo só para o CampoValor renderizar o input certo.
function comoCampo(sub: SubCampo, pai: Campo): Campo {
  return { id: sub.id, colecaoId: pai.colecaoId, nome: sub.nome, tipo: sub.tipo, ordem: 0, config: sub.config };
}

export function linhasDe(valor: unknown): Linha[] {
  return Array.isArray(valor) ? (valor.filter((l) => typeof l === 'object' && l !== null) as Linha[]) : [];
}

// Editor de uma seção: lista de linhas repetíveis, cada uma com os quadradinhos
// (subcampos). Dá pra adicionar uma linha ou várias de uma vez, e remover.
export function SecaoEditor({
  campo,
  linhas,
  aoMudar,
}: {
  campo: Campo;
  linhas: Linha[];
  aoMudar: (linhas: Linha[]) => void;
}): JSX.Element {
  const subs = campo.config.subcampos ?? [];
  const [qtd, setQtd] = useState(1);

  function alterarCelula(i: number, subId: string, v: unknown): void {
    aoMudar(linhas.map((l, idx) => (idx === i ? { ...l, [subId]: v } : l)));
  }
  function adicionar(n: number): void {
    const novas: Linha[] = Array.from({ length: Math.max(1, n) }, () => ({}));
    aoMudar([...linhas, ...novas]);
  }
  function remover(i: number): void {
    aoMudar(linhas.filter((_, idx) => idx !== i));
  }

  return (
    <div className="secao">
      {linhas.map((linha, i) => (
        // A ordem/quantidade de linhas muda por índice; sem id estável, a key é o índice.
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="secao__linha">
          <div className="secao__cabeca">
            <span className="secao__num">#{i + 1}</span>
            <button
              type="button"
              className="btn btn--icone"
              aria-label={`Remover linha ${i + 1}`}
              onClick={() => remover(i)}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="secao__campos">
            {subs.map((s) => (
              <label key={s.id} className="campo secao__campo">
                <span className="campo__rotulo">{s.nome}</span>
                <CampoValor
                  campo={comoCampo(s, campo)}
                  valor={linha[s.id]}
                  aoMudar={(v) => alterarCelula(i, s.id, v)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="secao__acoes">
        <Botao variante="fantasma" onClick={() => adicionar(1)}>
          <Plus size={16} />
          Adicionar linha
        </Botao>
        <div className="secao__multi">
          <input
            className="campo__controle secao__qtd"
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            value={qtd}
            onChange={(e) => setQtd(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            aria-label="Quantas linhas adicionar"
          />
          <Botao variante="fantasma" onClick={() => adicionar(qtd)}>
            Adicionar {qtd}
          </Botao>
        </div>
      </div>
    </div>
  );
}
