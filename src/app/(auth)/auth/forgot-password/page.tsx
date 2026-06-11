"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function ForgotPasswordForm() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();
  const [email, setEmail] = useState(() => sp.get("email")?.trim() ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError("Formato de email inválido.");
      return;
    }

    setSending(true);
    // Anti-enumeração: a resposta é sempre genérica, independentemente de o
    // email existir ou de erros do servidor — nunca confirmar contas.
    await supabase.auth
      .resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/callback/client`,
      })
      .catch(() => null);

    setSending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verifica o teu email</CardTitle>
          <CardDescription>
            Se existir uma conta com este email, vais receber um link para
            definir uma nova palavra-passe.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Voltar ao login</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar palavra-passe</CardTitle>
        <CardDescription>
          Indica o email da tua conta para receberes um link de recuperação.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md border border-red-200">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="treinador@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={sending}
          >
            {sending ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                A enviar...
              </>
            ) : (
              "Enviar link de recuperação"
            )}
          </Button>
          <p className="text-sm text-slate-500 text-center">
            <Link href="/login" className="text-emerald-600 font-medium hover:underline">
              Voltar ao login
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="p-4">A carregar...</div>}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
