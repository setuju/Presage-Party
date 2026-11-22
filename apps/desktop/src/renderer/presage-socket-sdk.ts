import { io, Socket } from 'socket.io-client';

export interface TelemetryPayload {
  roomId: string;
  playerId: string;
  ts: number;
  blink?: boolean;
  talk?: boolean;
  breathingRate?: number;
  flinch?: boolean;
}

export interface PresageSdkOptions {
  serverUrls?: string[];
  targetFps?: number;
  authToken?: string;
  connectTimeoutMs?: number;
}

export const DEFAULT_SERVER_URLS = [
  'https://presage-party.onrender.com',
  'https://presage-party.enzonic.dev',
];

export class PresageSocketSDK {
  private socket!: Socket;
  private serverUrls: string[];
  private currentUrlIndex = 0;
  private minIntervalMs: number;
  private lastSentAt = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private latestPayload: TelemetryPayload | null = null;
  private listeners: Array<{ event: string; handler: (data: any) => void }> = [];
  private authToken?: string;
  private connectTimeoutMs: number;

  constructor(options: PresageSdkOptions = {}) {
    this.serverUrls =
      options.serverUrls && options.serverUrls.length > 0
        ? options.serverUrls
        : DEFAULT_SERVER_URLS;
    this.authToken = options.authToken;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 4000;

    const fps = Math.max(1, Math.min(30, options.targetFps ?? 10));
    this.minIntervalMs = Math.floor(1000 / fps);

    this.connectToCurrent();
  }

  private connectToCurrent(): void {
    const activeUrl = this.serverUrls[this.currentUrlIndex];
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    this.socket = io(activeUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 2,
      reconnectionDelay: 800,
      timeout: this.connectTimeoutMs,
      auth: this.authToken ? { token: this.authToken } : undefined,
    });

    for (const { event, handler } of this.listeners) {
      this.socket.on(event, handler);
    }

    this.socket.on('connect', () => {
      console.log('[PresageSDK] Connected to:', activeUrl);
    });

    this.socket.on('connect_error', (err) => {
      console.warn(`[PresageSDK] Failed (${activeUrl}):`, err.message);
      if (this.currentUrlIndex + 1 < this.serverUrls.length) {
        this.currentUrlIndex += 1;
        console.log('[PresageSDK] Failing over to:', this.serverUrls[this.currentUrlIndex]);
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

  public joinRoom(roomId: string, playerName: string): void {
    this.socket.emit('join-room', { roomId, playerName });
  }

  public sendTelemetry(payload: TelemetryPayload): void {
    const now = performance.now();
    const isCriticalEvent = Boolean(payload.flinch || payload.blink);

    if (isCriticalEvent || now - this.lastSentAt >= this.minIntervalMs) {
      this.flush(payload, now);
      return;
    }

    this.latestPayload = payload;
    if (!this.pendingTimer) {
      const waitMs = this.minIntervalMs - (now - this.lastSentAt);
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        if (this.latestPayload) {
          this.flush(this.latestPayload, performance.now());
          this.latestPayload = null;
        }
      }, waitMs);
    }
  }

  private flush(payload: TelemetryPayload, timestamp: number): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.lastSentAt = timestamp;
    this.socket.emit('telemetry', payload);
  }

  public on<T = unknown>(event: string, handler: (data: T) => void): void {
    this.listeners.push({ event, handler });
    this.socket.on(event, handler);
  }

  public disconnect(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.socket.disconnect();
  }
}
