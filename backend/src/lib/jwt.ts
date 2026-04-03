import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

const secret = process.env.JWT_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET is required in production");
}

const JWT_SECRET = secret ?? "dev-only-change-in-production";

export function signUserToken(userId: string, role: UserRole) {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyUserToken(token: string): { sub: string; role: UserRole } {
  const p = jwt.verify(token, JWT_SECRET) as { sub: string; role: UserRole };
  return p;
}
