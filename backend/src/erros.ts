// Erro de domínio com código HTTP. O error handler global (server.ts) lê o
// statusCode e responde com ele, sem vazar stack pro cliente.
export class ErroHttp extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ErroHttp';
  }
}
