import { useEffect, useState } from 'react';
import { urlMini } from '../imagens/urls';

interface Props {
  /** Key R2 da foto (gera a URL `_t.jpg`). */
  fotoKey: string;
  tamanho: number;
  className?: string;
  alt?: string;
}

/** Mini com placeholder + fade-in — evita tela branca e layout shift. */
export function Miniatura({
  fotoKey,
  tamanho,
  className = 'capa',
  alt = '',
}: Props): JSX.Element {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(false);
  }, [fotoKey]);
  return (
    <span className="miniatura" style={{ width: tamanho, height: tamanho }}>
      {!ok && <span className="miniatura__skel" aria-hidden="true" />}
      <img
        className={`${className}${ok ? ' miniatura__img--on' : ' miniatura__img'}`}
        style={{ width: tamanho, height: tamanho }}
        src={urlMini(fotoKey)}
        alt={alt}
        width={tamanho}
        height={tamanho}
        loading="lazy"
        decoding="async"
        onLoad={() => setOk(true)}
      />
    </span>
  );
}
