// Trava de scroll do fundo com CONTADOR DE REFERÊNCIA (refcount).
//
// Antes, FolhaInferior e Visor faziam cada um `document.body.style.overflow =
// 'hidden'` guardando o valor anterior. Quando um modal aninhado (ex.: Visor por
// cima de uma FolhaInferior) era desmontado FORA DE ORDEM — algo comum quando um
// evento de realtime fecha a folha por baixo do visor — o valor 'hidden' capturado
// vazava e o body ficava preso, matando o scroll da página até recarregar.
//
// Aqui centralizamos: só a PRIMEIRA trava salva o overflow original e o aplica; só
// a ÚLTIMA liberação restaura. Ordem de montagem/desmontagem deixa de importar.

let contador = 0;
let overflowOriginal = '';

export function travarScroll(): () => void {
  if (contador === 0) {
    overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  contador += 1;

  let liberado = false;
  return function liberar(): void {
    if (liberado) return; // idempotente: chamar duas vezes não zera o contador errado
    liberado = true;
    contador -= 1;
    if (contador <= 0) {
      contador = 0;
      document.body.style.overflow = overflowOriginal;
    }
  };
}
