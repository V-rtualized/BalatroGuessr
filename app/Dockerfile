FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.ts ./
COPY public/screenshots_index.json ./public/screenshots_index.json
COPY public/screenshots ./public/screenshots

EXPOSE 3000
CMD ["node", "--import", "tsx", "server.ts"]
