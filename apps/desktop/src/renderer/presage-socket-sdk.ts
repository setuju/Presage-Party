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
  serverUrl: string;
  targetFps?: number;
  authToken?: string;
}

export class PresageSocketSDK {
  private socket: Socket;
  private minIntervalMs: number;
  private lastSentAt = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private latestPayload: TelemetryPayload | null = null;

  constructor(options: PresageSdkOptions) {
    const fps = Math.max(1, Math.min(30, options.targetFps ?? 10));
    this.minIntervalMs = Math.floor(1000 / fps);

    this.socket = io(options.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      auth: options.authToken ? { token: options.authToken } : undefined,
    });
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
    this.socket.on(event, handler);
  }

  public disconnect(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.socket.disconnect();
  }
}
