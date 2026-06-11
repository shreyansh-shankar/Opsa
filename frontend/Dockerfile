FROM node:20-alpine

WORKDIR /app

# Install dependencies first (for docker caching)
COPY package*.json ./
RUN npm ci

# Copy the rest of the frontend source code
COPY . .

# Expose Next.js port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start Next.js dev server
CMD ["npm", "run", "dev", "--", "--port", "3000", "--hostname", "0.0.0.0"]
