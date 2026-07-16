import {
  AlignLeft,
  Calendar,
  Hash,
  Image,
  ListChecks,
  ToggleLeft,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { TipoCampo } from '../../../shared/tipos';

const ICONE: Record<TipoCampo, LucideIcon> = {
  texto: Type,
  paragrafo: AlignLeft,
  numero: Hash,
  imagem: Image,
  selecao: ListChecks,
  data: Calendar,
  booleano: ToggleLeft,
};

export const ROTULO_TIPO: Record<TipoCampo, string> = {
  texto: 'Texto',
  paragrafo: 'Parágrafo',
  numero: 'Número',
  imagem: 'Imagem',
  selecao: 'Seleção',
  data: 'Data',
  booleano: 'Sim / Não',
};

export function IconeTipo({ tipo, size = 18 }: { tipo: TipoCampo; size?: number }): JSX.Element {
  const Icone = ICONE[tipo];
  return <Icone size={size} aria-hidden="true" />;
}
