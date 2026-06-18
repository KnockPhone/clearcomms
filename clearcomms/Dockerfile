FROM node:20-bookworm

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies first (better layer caching).
COPY package*.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# SQLite data directory (mounted as a volume in docker-compose).
RUN mkdir -p /app/data
ENV DATABASE_DIR=/app/data

EXPOSE 3000
CMD ["node", "src/server.js"]
