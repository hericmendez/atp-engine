# Etapa 1: build
FROM node:23-alpine

WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia o restante do projeto
COPY . .

# Build do NestJS
RUN npm run build

# Etapa 2: runtime
FROM node:23-alpine

WORKDIR /app

# Copia apenas os arquivos necessários do build
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm install --production

# Expõe a porta
EXPOSE 3000

# Comando para rodar a API
CMD ["node", "dist/main.js"]
