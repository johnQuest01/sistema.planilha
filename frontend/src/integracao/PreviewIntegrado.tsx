import { useState } from 'react';
import type { Campo, Registro, SubCampo } from '../../../shared/tipos';
import { Visor } from '../imagens/Visor';
import { urlMini } from '../imagens/urls';
import { formatarValor, keysDoCampo } from '../preencher/derivarResumo';
import { linhasDe } from '../preencher/SecaoEditor';

// Prévia SOMENTE LEITURA de um registro (usada no corpo unido da integração). Não
// tem ações que toquem em um registro específico — quem edita é o FichaIntegrada.
function keysDe(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((k): k is string => typeof k === 'string') : [];
}

function GradeFotos({
  keys,
  aoAbrir,
}: {
  keys: string[];
  aoAbrir: (i: number) => void;
}): JSX.Element {
  if (keys.length === 0) return <span className="preview-valor preview-valor--vazio">—</span>;
  return (
    <div className="preview-imagens">
      {keys.map((k, i) => (
        <button
          key={k}
          type="button"
          className="preview-imagens__botao"
          onClick={() => aoAbrir(i)}
          aria-label={`Ver foto ${i + 1} de ${keys.length}`}
        >
          <img className="preview-imagens__foto" src={urlMini(k)} alt="" loading="lazy" decoding="async" />
        </button>
      ))}
    </div>
  );
}

function textoSub(sub: SubCampo, valor: unknown): string {
  if (sub.tipo === 'imagem') return '';
  const fake: Campo = { id: sub.id, colecaoId: '', nome: sub.nome, tipo: sub.tipo, ordem: 0, config: sub.config };
  return formatarValor(fake, valor).trim();
}

function Valor({
  campo,
  registro,
  aoAbrirVisor,
}: {
  campo: Campo;
  registro: Registro;
  aoAbrirVisor: (keys: string[], i: number) => void;
}): JSX.Element {
  const valor = registro.valores[campo.id];
  if (campo.tipo === 'imagem') {
    const keys = keysDoCampo(registro, campo.id);
    return <GradeFotos keys={keys} aoAbrir={(i) => aoAbrirVisor(keys, i)} />;
  }
  if (campo.tipo === 'secao') {
    const linhas = linhasDe(valor);
    const subs = campo.config.subcampos ?? [];
    if (linhas.length === 0) return <span className="preview-valor preview-valor--vazio">—</span>;
    return (
      <div className="preview-secao">
        {linhas.map((linha, i) => (
          <div key={i} className="preview-secao__linha">
            <span className="preview-secao__num">#{i + 1}</span>
            <div className="preview-secao__celulas">
              {subs.map((s) => {
                if (s.tipo === 'imagem') {
                  const keys = keysDe(linha[s.id]);
                  return (
                    <div key={s.id} className="preview-secao__celula preview-secao__celula--foto">
                      <span className="preview-secao__subnome">{s.nome}</span>
                      <GradeFotos keys={keys} aoAbrir={(idx) => aoAbrirVisor(keys, idx)} />
                    </div>
                  );
                }
                const txt = textoSub(s, linha[s.id]);
                return (
                  <div key={s.id} className="preview-secao__celula">
                    <span className="preview-secao__subnome">{s.nome}</span>
                    <span className={`preview-valor${txt === '' ? ' preview-valor--vazio' : ''}`}>
                      {txt === '' ? '—' : txt}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }
  const txt = formatarValor(campo, valor).trim();
  return txt === '' ? (
    <span className="preview-valor preview-valor--vazio">—</span>
  ) : (
    <span className="preview-valor">{txt}</span>
  );
}

export function PreviewIntegrado({
  campos,
  registro,
}: {
  campos: Campo[];
  registro: Registro;
}): JSX.Element {
  const [visor, setVisor] = useState<{ keys: string[]; indice: number } | null>(null);
  return (
    <div className="preview-campos">
      {campos.map((campo) => (
        <div key={campo.id} className="preview-campo">
          {campo.config.titulo !== undefined && campo.config.titulo !== '' && (
            <span className="preview-campo__titulo-bloco">{campo.config.titulo}</span>
          )}
          <span className="preview-campo__nome">{campo.nome}</span>
          <Valor campo={campo} registro={registro} aoAbrirVisor={(keys, indice) => setVisor({ keys, indice })} />
        </div>
      ))}
      {visor !== null && (
        <Visor keys={visor.keys} indiceInicial={visor.indice} aoFechar={() => setVisor(null)} />
      )}
    </div>
  );
}
