// A base pública do R2 vem do backend em runtime (GET /api/config) e é fixada uma vez
// na subida do app. As fotos guardam só a key da cheia no jsonb; a mini é derivada por
// convenção (.jpg -> _t.jpg), como manda a seção 6.1.
let baseR2 = '';

export function definirBaseR2(base: string): void {
  baseR2 = base.replace(/\/+$/, '');
}

export function keyMini(key: string): string {
  return key.replace(/\.(\w+)$/, '_t.$1');
}

export function urlCheia(key: string): string {
  return `${baseR2}/${key}`;
}

export function urlMini(key: string): string {
  return `${baseR2}/${keyMini(key)}`;
}
