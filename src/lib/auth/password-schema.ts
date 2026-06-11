import { z } from "zod";

// Fonte única do mínimo de password (SEC-05) — usada no registo,
// na definição de nova password e validada nos testes de segurança.
export const passwordSchema = z
  .string()
  .min(10, "A password deve ter pelo menos 10 caracteres.")
  .max(200, "A password é demasiado longa.");
