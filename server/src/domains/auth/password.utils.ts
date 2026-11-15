import argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      hashLength: 32,
    });
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  try {
    console.log('Verifying password:', hash, password);
    return await argon2.verify(hash, password);
  } catch (error) {
    console.error('Error verifying password:', error);
    throw new Error('Failed to verify password');
  }
}
