FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and Prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install ALL dependencies
RUN npm ci

# Generate client
RUN npx prisma generate

# Copy the rest of the source code and build
COPY . .
RUN npm run build

# Prune dev dependencies before copying to runner
RUN npm prune --omit=dev

# Production image
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and Prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev

# Generate client for production
RUN npx prisma generate

# Copy the compiled TypeScript code from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 5000

CMD ["npm", "start"]
