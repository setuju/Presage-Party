import { io as esmIo, Socket } from 'socket.io-client';

export interface ScorePayload {
  roomCode?: string;
  score: number;
  flinches?: number;
  ts?: number;
  flinch?: boolean;
  blink?: boolean;
}

export interface PresageSdkOptions {
  serverUrls?: string[];
  targetFps?: number;
  connectTimeoutMs?: number;
}

export const DEFAULT_SERVER_URLS = [
  'https://presage-party.onrender.com',
  'https://presage-party.enzonic.dev',
];

function resolveSocketIoClient(): typeof esmIo {
  const win = typeof globalThis !== 'undefined' ? (globalThis as { io?: typeof esmIo }) : undefined;
  if (win && typeof win.io === 'function') {
    return win.io;
  }
  return esmIo;
}

export class PresageSocketSDK {
  private socket!: Socket;
  private serverUrls: string[];
  private currentUrlIndex = 0;
  private minIntervalMs: number;
  private lastScoreSentAt = 0;
  private pendingScoreTimer: ReturnType<typeof setTimeout> | null = null;
  private latestScorePayload: ScorePayload | null = null;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
  private connectTimeoutMs: number;

  constructor(options: PresageSdkOptions = {}) {
    this.serverUrls =
      options.serverUrls && options.serverUrls.length > 0
        ? options.serverUrls
        : DEFAULT_SERVER_URLS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 4000;

    const fps = Math.max(1, Math.min(30, options.targetFps ?? 6));
    this.minIntervalMs = Math.floor(1000 / fps);

    this.connectToCurrent();
  }

  private connectToCurrent(): void {
    const activeUrl = this.serverUrls[this.currentUrlIndex];
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    const clientFactory = resolveSocketIoClient();
    this.socket = clientFactory(activeUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 2,
      reconnectionDelay: 800,
      timeout: this.connectTimeoutMs,
    });

    for (const { event, handler } of this.listeners) {
      this.socket.on(event, handler);
    }

    this.socket.on('connect', () => {
      console.log('[PresageSDK] Connected to primary/active server:', activeUrl);
    });

    this.socket.on('connect_error', (err: Error) => {
      console.warn(`[PresageSDK] Connection failed (${activeUrl}):`, err.message);
      if (this.currentUrlIndex + 1 < this.serverUrls.length) {
        this.currentUrlIndex += 1;
        console.log('[PresageSDK] Failing over to backup:', this.serverUrls[this.currentUrlIndex]);
        this.connectToCurrent();
      }
    });
  }

  public getActiveServerUrl(): string {
    return this.serverUrls[this.currentUrlIndex];
  }

  public setFps(fps: number): void {
    const clamped = Math.max(1, Math.min(30, fps));
    this.minIntervalMs = Math.floor(1000 / clamped);
  }

  public getRooms(): void {
    this.socket.emit('get_rooms');
  }

  public createRoom(hostName: string, roomCode?: string): void {
    this.socket.emit('create_room', { hostName, roomCode });
  }

  public joinRoom(
    data: { code?: string; roomCode?: string; name?: string; playerName?: string },
    callback?: (res: unknown) => void
  ): void {
    const normalized = {
      code: data.code ?? data.roomCode,
      name: data.name ?? data.playerName,
    };
    this.socket.emit('join_room', normalized, callback);
  }

  public startGame(code?: string, callback?: (res: unknown) => void): void {
    this.socket.emit('start_game', code ? { code } : {}, callback);
  }

  public reportScore(payload: ScorePayload, callback?: (res: unknown) => void): void {
    const now = performance.now();
    const isCritical = Boolean(payload.flinch || payload.blink);

    if (isCritical || now - this.lastScoreSentAt >= this.minIntervalMs) {
      this.flushScore(payload, now, callback);
      return;
    }

    this.latestScorePayload = payload;
    if (!this.pendingScoreTimer) {
      const waitMs = this.minIntervalMs - (now - this.lastScoreSentAt);
      this.pendingScoreTimer = setTimeout(() => {
        this.pendingScoreTimer = null;
        if (this.latestScorePayload) {
          this.flushScore(this.latestScorePayload, performance.now());
          this.latestScorePayload = null;
        }
      }, waitMs);
    }
  }

  private flushScore(
    payload: ScorePayload,
    timestamp: number,
    callback?: (res: unknown) => void
  ): void {
    if (this.pendingScoreTimer) {
      clearTimeout(this.pendingScoreTimer);
      this.pendingScoreTimer = null;
    }
    this.lastScoreSentAt = timestamp;
    this.socket.emit('report_score', payload, callback);
  }

  public sendVisibilityChange(isVisible: boolean): void {
    this.socket.emit('visibility_change', isVisible);
  }

  public on<T = unknown>(event: string, handler: (data: T) => void): void {
    this.listeners.push({ event, handler });
    this.socket.on(event, handler);
  }

  public disconnect(): void {
    if (this.pendingScoreTimer) clearTimeout(this.pendingScoreTimer);
    this.socket.disconnect();
  }
}
