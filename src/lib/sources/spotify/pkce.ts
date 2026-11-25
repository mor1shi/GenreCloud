function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type PkcePair = { verifier: string; challenge: string };

/** RFC 7636 S256 pair: 64 random bytes, base64url, SHA-256 challenge. */
export async function createPkcePair(): Promise<PkcePair> {
  const random = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function randomState(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(16)));
}
