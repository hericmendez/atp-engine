//src/app/api/auth/me/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";

export async function GET() {
  const token = (await cookies()).get("token")?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Não autenticado" },
      { status: 401 }
    );
  }

  try {
    const user = verifyToken(token);
    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { error: "Token inválido" },
      { status: 401 }
    );
  }
}
