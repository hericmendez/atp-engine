import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";

export async function POST(req: Request) {
  const { name, email, password } = await req.json();

  await connectDB();

  const exists = await User.findOne({ email });
  if (exists) {
    return NextResponse.json(
      { error: "Email já cadastrado" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await User.create({ name, email, passwordHash });

  return NextResponse.json({ ok: true });
}
