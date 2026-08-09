import { z } from 'zod';

// Login: só e-mail e senha.
export const credenciaisSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    senha: z.string().min(8, 'mínimo 8 caracteres').max(200),
  })
  .strict();

export type Credenciais = z.infer<typeof credenciaisSchema>;

// Cadastro:
// - com `token`/`codigo`: entra como membro na conta do admin que gerou o token
//   (também aceita o código legado da conta Bruno);
// - sem token: cria um workspace NOVO e o usuário vira `dono` dele.
export const registrarSchema = z
  .object({
    nome: z.string().trim().min(1, 'informe seu nome').max(60),
    email: z.string().trim().toLowerCase().email().max(200),
    senha: z.string().min(8, 'mínimo 8 caracteres').max(200),
    // Aceita `token` (novo) ou `codigo` (legado / mesmo campo na UI).
    token: z.string().trim().min(1).max(200).optional(),
    codigo: z.string().trim().min(1).max(200).optional(),
    /** Nome do workspace ao criar conta própria (opcional). */
    nomeConta: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .transform((v) => ({
    nome: v.nome,
    email: v.email,
    senha: v.senha,
    token: (v.token ?? v.codigo ?? '').trim(),
    nomeConta: v.nomeConta,
  }));

export type Registrar = z.infer<typeof registrarSchema>;

// Troca do código de convite permanente da conta (opcional; tokens são o caminho novo).
export const codigoConviteSchema = z
  .object({
    codigo: z.string().trim().min(4, 'mínimo 4 caracteres').max(200),
  })
  .strict();

// Admin define/troca a senha de login de qualquer usuário da conta.
export const senhaUsuarioSchema = z
  .object({
    senha: z.string().min(8, 'mínimo 8 caracteres').max(200),
  })
  .strict();

export const criarTokenConviteSchema = z
  .object({
    rotulo: z.string().trim().max(80).optional(),
    diasValidade: z.number().int().min(1).max(365).optional(),
    maxUsos: z.number().int().min(1).max(10_000).optional(),
  })
  .strict();
