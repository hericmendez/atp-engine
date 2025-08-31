# ATP Engine (NestJS)
  
 ATP Engine is the API made for the Save State Project. ATP stands for "Ash Twin Project", inspired by the game Outer Wilds. 

## Requisitos
- Node 18+
- MongoDB em execução
- Credenciais IGDB (Twitch)


## Como rodar:  

### Rodando Localmente:
npm install
npm run start:dev

Base URL: http://localhost:3000/api

### Rodando no Docker:
#### 1. Crie um arquivo `docker-compose.yml` na raiz do projeto:

```yaml
version: '3.8'
services:
  mongo:
    image: mongo:6.0
    container_name: nest_mongo
    restart: always
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: rootpassword
      MONGO_INITDB_DATABASE: backlogdb
    volumes:
      - ./docker/mongo_data:/data/db
```
#### 2. Suba o container:
docker compose up -d

#### 3. Teste a conexão:
docker exec -it nest_mongo mongosh -u root -p rootpassword
use backlogdb
db.createCollection("test")
db.test.insertOne({ hello: "world" })
db.test.find()

#### 4. (Opcional) Mongo Express para interface web:
  mongo-express:
    image: mongo-express
    restart: always
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_ADMINUSERNAME: root
      ME_CONFIG_MONGODB_ADMINPASSWORD: rootpassword
      ME_CONFIG_MONGODB_SERVER: mongo
      Acesse: http://localhost:8081


## Setup do projeto

Copie o .env de exemplo e configure as variáveis:

cp .env.example .env


Exemplo .env:
```bash
MONGO_URI=mongodb://root:rootpassword@localhost:27017/savestate?authSource=admin
JWT_SECRET=supersecretaqui
IGDB_CLIENT_ID=igdbclientid
IGDB_CLIENT_SECRET=igdbclientsecret
PORT=3000
```

Instale dependências:
npm install


Rode o NestJS em modo dev:

npm run start:dev

Base URL: http://localhost:3000/api



## Endpoints

### Auth
POST /api/auth/register
{ "username":"revi", "email":"revi@mail.com", "password":"123456" }

POST /api/auth/login
{ "username":"revi", "password":"123456" }
# → { "access_token":"..." }

Use o Bearer token nas rotas /api/backlog/...

### Backlog (protegido)
GET    /api/backlog/:username/:category?limit=10&offset=0&sortBy=name&order=asc
POST   /api/backlog/:username/:category
PUT    /api/backlog/:username/:category/:id
DELETE /api/backlog/:username/:category/:id
### categories: favorites | playing | finished | standby | dropped

Body POST/PUT:
{
  "name":"The Legend of Zelda",
  "igdbId": 1234,
  "platform":"Nintendo Switch",
  "release_date":"2023-05-12",
  "notes":"..."
}

### Games (público)
GET /api/games?title=zelda&platform=nintendo%20switch&releaseDate=2020-01-01&limit=10&sortBy=first_release_date&order=desc

### Collections (público)
GET /api/collections/platforms
GET /api/collections/genres
GET /api/collections/goty
