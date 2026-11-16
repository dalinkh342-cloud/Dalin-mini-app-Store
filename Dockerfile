FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY src ./src
COPY public ./public
CMD ["node", "src/index.js"]
