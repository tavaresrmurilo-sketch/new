// Balde de fichas para limitar a taxa de mensagens por conexão.
export class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(private rate: number, private burst: number) {
    this.tokens = burst;
  }
  take(n = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

export function buckets() {
  return {
    msg: new TokenBucket(40, 80),
    cmd: new TokenBucket(20, 50),
    chat: new TokenBucket(1, 4),
    marker: new TokenBucket(1, 3),
    lobby: new TokenBucket(5, 12),
    room: new TokenBucket(0.5, 3),
  };
}
