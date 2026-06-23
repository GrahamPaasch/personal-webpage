# Sidewalks of Rage — WebSocket game server image (Fly.io / any container host).
# Only the server + its protocol dependency run here (no Vite, no client bundle).
FROM node:20-slim

WORKDIR /app

# Production deps only. (Note: package.json lists phaser as a client dep, so it is also
# installed here; harmless. Split into server/package.json with only `ws` for a leaner image.)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# The server imports ../src/network/protocol.js (canonical protocol), so ship both trees.
COPY server ./server
COPY src ./src

# Fly Proxy (or any host) forwards to this internal port; the server reads PORT (default 8080)
# and binds 0.0.0.0 via http.listen(port) with no host arg.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
