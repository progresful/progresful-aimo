import crypto from 'node:crypto';

// Ed25519 signing for quotes, policy versions and approval decisions.
//
// The gateway key is derived deterministically from GATEWAY_SIGNING_SEED (any
// string, hashed to 32 bytes) or, as a fallback, sha256(BETTER_AUTH_SECRET +
// 'gateway'), so signatures survive restarts without storing a private key.

// DER prefix of a PKCS#8 Ed25519 private key; the 32-byte seed follows it.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export const canonicalJson = (value: unknown): string => JSON.stringify(sortKeys(value));

const sortKeys = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
};

export const sha256 = (input: string | Buffer) => crypto.createHash('sha256').update(input).digest('hex');

const seedBytes = () => {
  const source = process.env.GATEWAY_SIGNING_SEED || `${process.env.BETTER_AUTH_SECRET ?? ''}gateway`;
  return crypto.createHash('sha256').update(source).digest();
};

export const keyPairFromSeed = (seed: Buffer) => {
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  const publicKey = crypto.createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string };
  const kid = `mandate-gw-${sha256(Buffer.from(jwk.x, 'base64url')).slice(0, 12)}`;
  return { privateKey, publicKey, jwk, kid };
};

let gatewayKey: ReturnType<typeof keyPairFromSeed> | null = null;
const key = () => (gatewayKey ??= keyPairFromSeed(seedBytes()));

export const SIGNATURE_PREFIX = 'ed25519:';

/** Signs canonicalJson(payload); returns `ed25519:<base64url>`. */
export const sign = (payload: unknown) =>
  SIGNATURE_PREFIX + crypto.sign(null, Buffer.from(canonicalJson(payload)), key().privateKey).toString('base64url');

export const verify = (payload: unknown, signature: string, publicKey = key().publicKey) => {
  if (!signature?.startsWith(SIGNATURE_PREFIX)) return false;
  try {
    return crypto.verify(null, Buffer.from(canonicalJson(payload)), publicKey, Buffer.from(signature.slice(SIGNATURE_PREFIX.length), 'base64url'));
  } catch {
    return false;
  }
};

export const publicJwks = () => {
  const { jwk, kid } = key();
  return { keys: [{ ...jwk, kid, alg: 'EdDSA', use: 'sig' }] };
};

export const keyId = () => key().kid;

/** "ed25519:7f3a…c91e" for display. */
export const shortSignature = (signature: string | null | undefined) =>
  signature ? `${SIGNATURE_PREFIX}${signature.slice(SIGNATURE_PREFIX.length, SIGNATURE_PREFIX.length + 4)}…${signature.slice(-4)}` : null;
