import { WebSocketServer, WebSocket } from 'ws';
import { CONFIG } from './config.js';
import { HandDetectionResult } from './fingerCounterService.js';
import { getNetworkAddresses } from './utils/network.js';

export interface HandCountWSMessage extends HandDetectionResult {
  timestamp: number;
  fps: number;
}

export class HandCountWebSocketServer {
  private wss: WebSocketServer | null = null;
  private port: number = CONFIG.WS_PORT;
  private clients: Set<WebSocket> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  public start(): void {
    try {
      this.wss = new WebSocketServer({ port: this.port, host: CONFIG.HOST });
      const networkIps = getNetworkAddresses();
      console.log(`[WebSocketServer] Bound to interface: ${CONFIG.HOST}:${this.port}`);
      console.log(`[WebSocketServer] Listening at ws://${CONFIG.HOST}:${this.port}`);
      networkIps.forEach((ip) => {
        console.log(`[WebSocketServer] Accessible on network: ws://${ip}:${this.port}`);
      });

      this.wss.on('connection', (ws: WebSocket, req) => {
        const clientIp = req.socket.remoteAddress || 'unknown';
        console.log(`[WebSocketServer] New client connected from ${clientIp}`);
        
        this.clients.add(ws);

        // Send initial connection acknowledgment
        const welcomeMsg = JSON.stringify({
          type: 'CONNECTED',
          message: 'Hand Tracking Stream Established',
          timestamp: Date.now(),
        });
        ws.send(welcomeMsg);

        ws.on('pong', () => {
          (ws as any).isAlive = true;
        });

        ws.on('close', () => {
          console.log(`[WebSocketServer] Client disconnected (${clientIp})`);
          this.clients.delete(ws);
        });

        ws.on('error', (err) => {
          console.error(`[WebSocketServer] Client error (${clientIp}):`, err);
          this.clients.delete(ws);
        });
      });

      // Keepalive heartbeat every 15 seconds
      this.pingInterval = setInterval(() => {
        this.clients.forEach((ws) => {
          if ((ws as any).isAlive === false) {
            this.clients.delete(ws);
            return ws.terminate();
          }
          (ws as any).isAlive = false;
          ws.ping();
        });
      }, 15000);
    } catch (err) {
      console.error('[WebSocketServer] Error launching WebSocket server:', err);
    }
  }

  public stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      console.log('[WebSocketServer] WebSocket server closed.');
    }
  }

  /**
   * Broadcasts detection payload to all active WebSocket clients
   */
  public broadcast(result: HandDetectionResult, currentFps: number): void {
    if (this.clients.size === 0) return;

    const payload: HandCountWSMessage = {
      ...result,
      timestamp: Date.now(),
      fps: Number(currentFps.toFixed(1)),
    };

    const dataString = JSON.stringify(payload);

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(dataString);
      }
    });
  }

  public getConnectedClientCount(): number {
    return this.clients.size;
  }
}
