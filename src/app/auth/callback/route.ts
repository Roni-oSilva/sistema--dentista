import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/** Troca o código do link de e-mail (recuperação de senha) por uma sessão. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/admin");
  if (code) {
    const db = await createSupabaseServerClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      if (next === "/auth/nova-senha") {
        // marca que esta sessão veio de um link de recuperação (vale 15 min)
        res.cookies.set("pw_recovery", "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 900, path: "/" });
      }
      return res;
    }
  }
  return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent("Link inválido ou expirado. Solicite um novo.")}`);
}
