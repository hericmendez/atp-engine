FROM node:20-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production && cp -R node_modules /prod_modules
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS production
WORKDIR /app
COPY --from=base /prod_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
