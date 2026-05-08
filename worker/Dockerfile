FROM node:20

# Main app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy full project
COPY . .

# Pre-install dependencies for the Next.js template to avoid 'npm install' at runtime
WORKDIR /app/preview-system/preview-worker/template
RUN npm install

# Return to app root
WORKDIR /app

# Expose orchestrator port
EXPOSE 3001

# Environment defaults
ENV WORKER_PORT=3001
ENV POOL_MIN=1
ENV POOL_MAX=5
ENV PORT_BASE=4000
ENV SESSION_TTL_MS=300000
ENV BOOT_TIMEOUT_MS=60000

# Start main orchestrator
CMD ["node", "server.js"]