# ── Stage 1: deps ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy production deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure upload directories exist inside the image
RUN mkdir -p public/assets/maps public/assets/audio

# Expose the app port
EXPOSE 3000

# Allow DM password override at runtime
ENV DM_PASSWORD=dm1234

# Health check — verify the server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/remote/player || exit 1

CMD ["node", "server.js"]
