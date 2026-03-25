import { jwtVerify } from 'jose';
import { config } from '../config/index.js';
import type { JWTPayload, UserRole } from '../types/index.js';
import { db } from '@/db/index.js';
import { sha256 } from './crypto.js';

// Helper function to verify JWT and get user
export async function verifyTokenAndGetUser(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      Buffer.from(config.jwtSecret)
    );
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export // Check if session is valid
async function isSessionValid(token: string): Promise<boolean> {
  const tokenHash = sha256(token);
  const session = await db.findSession(tokenHash);
  return session && session.length > 0;
}