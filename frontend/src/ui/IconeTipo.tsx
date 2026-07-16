import {
  AlignLeft,
  Calendar,
  CalendarClock,
  Hash,
  Image,
  Layers,
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
  datahora: CalendarClock,
  booleano: ToggleLeft,
  secao: Layers,
};

export const ROTULO_TIPO: Record<TipoCampo, string> = {
  texto: 'Texto',
  paragrafo: 'Parágrafo',
  numero: 'Número',
  imagem: 'Imagem',
  selecao: 'Seleção',
  data: 'Data',
  datahora: 'Data e hora',
  booleano: 'Sim / Não',
  secao: 'Seção',
};

export function IconeTipo({ tipo, size = 18 }: { tipo: TipoCampo; size?: number }): JSX.Element {
  const Icone = ICONE[tipo];
  return <Icone size={size} aria-hidden="true" />;
}
