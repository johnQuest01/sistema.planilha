import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import './ui.css';

// Evento não-padrão do Chrome/Android para instalação. Tipado à mão.
interface PromptInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CHAVE_DISPENSA = 'mostruario:instalar-dispensado';

function jaInstalado(): boolean {
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

function ehIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// Banner discreto para instalar o PWA. No Android/Chrome usa o prompt nativo; no
// iOS (que não expõe prompt) mostra a instrução do menu Compartilhar.
export function InstalarApp(): JSX.Element | null {
  const [prompt, setPrompt] = useState<PromptInstalar | null>(null);
  const [instrucaoIOS, setInstrucaoIOS] = useState(false);
  const [dispensado, setDispensado] = useState(
    () => localStorage.getItem(CHAVE_DISPENSA) === '1',
  );

  useEffect(() => {
    if (jaInstalado()) return;
    function aoPrompt(e: Event): void {
      e.preventDefault();
      setPrompt(e as PromptInstalar);
    }
    window.addEventListener('beforeinstallprompt', aoPrompt);
    if (ehIOS()) setInstrucaoIOS(true);
    return () => window.removeEventListener('beforeinstallprompt', aoPrompt);
  }, []);

  if (dispensado || jaInstalado()) return null;
  if (prompt === null && !instrucaoIOS) return null;

  function dispensar(): void {
    localStorage.setItem(CHAVE_DISPENSA, '1');
    setDispensado(true);
  }

  async function instalar(): Promise<void> {
    if (prompt === null) return;
    await prompt.prompt();
    const escolha = await prompt.userChoice;
    setPrompt(null);
    if (escolha.outcome === 'accepted') dispensar();
  }

  return (
    <div className="instalar" role="dialog" aria-label="Instalar aplicativo">
      <div className="instalar__txt">
        {prompt !== null ? (
          'Instale o Mostruário no seu celular para abrir como um aplicativo.'
        ) : (
          <>
            Para instalar: toque em <strong>Compartilhar</strong> e depois em{' '}
            <strong>“Adicionar à Tela de Início”</strong>.
          </>
        )}
      </div>
      {prompt !== null && (
        <button
          type="button"
          className="btn btn--primario instalar__botao"
          onClick={() => void instalar()}
        >
          <Download size={16} />
          Instalar
        </button>
      )}
      <button type="button" className="btn btn--icone" aria-label="Dispensar" onClick={dispensar}>
        <X size={16} />
      </button>
    </div>
  );
}
