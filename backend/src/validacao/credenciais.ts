import { z } from 'zod';

// Login: só e-mail e senha.
export const credenciaisSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    senha: z.string().min(8, 'mínimo 8 caracteres').max(200),
  })
  .strict();

export type Credenciais = z.infer<typeof credenciaisSchema>;

// Cadastro: pede nome e o código de convite, além de e-mail e senha.
export const registrarSchema = z
  .object({
    nome: z.string().trim().min(1, 'informe seu nome').max(60),
    email: z.string().trim().toLowerCase().email().max(200),
    senha: z.string().min(8, 'mínimo 8 caracteres').max(200),
    codigo: z.string().min(1, 'informe o código de convite').max(200),
  })
  .strict();

export type Registrar = z.infer<typeof registrarSchema>;

// Troca do código de convite (só o dono do workspace).
export const codigoConviteSchema = z
  .object({
    codigo: z.string().trim().min(4, 'mínimo 4 caracteres').max(200),
  })
  .strict();
