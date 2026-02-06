import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "magic-computer-secret";

export interface User {
  username: string;
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const validUser = process.env.AUTH_USERNAME || "admin";
  const validPass = process.env.AUTH_PASSWORD || "magic123";
  return username === validUser && password === validPass;
}

export function createToken(user: User): string {
  return jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): User | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as User;
    return decoded;
  } catch {
    return null;
  }
}
