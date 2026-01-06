import { MESSAGE_TYPES } from './protocol.js';

export default class Client {
  constructor({ url, onOpen, onClose, onError, onMessage } = {}) {
    this.url = url || Client.defaultUrl();
    this.onOpen = onOpen || null;
    this.onClose = onClose || null;
    this.onError = onError || null;
    this.onMessage = onMessage || null;
    this.socket = null;
    this.handlers = new Map();
  }

  static defaultUrl() {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${protocol}://${window.location.hostname}:8080`;
    }

    return 'ws://localhost:8080';
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', (event) => {
      if (this.onOpen) {
        this.onOpen(event);
      }
    });

    this.socket.addEventListener('close', (event) => {
      if (this.onClose) {
        this.onClose(event);
      }
    });

    this.socket.addEventListener('error', (event) => {
      if (this.onError) {
        this.onError(event);
      }
    });

    this.socket.addEventListener('message', (event) => {
      let parsed = null;
      try {
        parsed = JSON.parse(event.data);
      } catch (error) {
        if (this.onMessage) {
          this.onMessage(event.data);
        }
        return;
      }

      if (parsed && parsed.type) {
        const handler = this.handlers.get(parsed.type);
        if (handler) {
          handler(parsed);
        }
      }

      if (this.onMessage) {
        this.onMessage(parsed);
      }
    });
  }

  disconnect(code, reason) {
    if (this.socket) {
      this.socket.close(code, reason);
    }
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  on(type, handler) {
    this.handlers.set(type, handler);
    return () => this.handlers.delete(type);
  }

  sendJoin(payload = {}) {
    return this.send(MESSAGE_TYPES.PLAYER_JOIN, payload);
  }

  sendMove(payload = {}) {
    return this.send(MESSAGE_TYPES.PLAYER_MOVE, payload);
  }

  sendAttack(payload = {}) {
    return this.send(MESSAGE_TYPES.PLAYER_ATTACK, payload);
  }

  sendKill(payload = {}) {
    return this.send(MESSAGE_TYPES.PLAYER_KILL, payload);
  }

  sendLeave(payload = {}) {
    return this.send(MESSAGE_TYPES.PLAYER_LEAVE, payload);
  }
}
