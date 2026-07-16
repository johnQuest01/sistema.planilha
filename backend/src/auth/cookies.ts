import type { CookieSerializeOptions } from '@fastify/cookie';
import { config } from '../config';

export const NOME_COOKIE_SESSAO = 'sessao';

const TRINTA_DIAS = 60 * 60 * 24 * 30;

// Util puro de opções de cookie. httpOnly + SameSite=Lax (ver seção 6.4).
export function opcoesSessao(): CookieSerializeOptions {
  return {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: TRINTA_DIAS,
  };
}

export function opcoesLimpar(): CookieSerializeOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' };
}
