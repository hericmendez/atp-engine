//src/lib/auth.ts

import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!

interface JwtPayload {
  userId: string
}

export async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token =  cookieStore.get('token')?.value

  if (!token) return null

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    return payload.userId
  } catch {
    return null
  }
}
