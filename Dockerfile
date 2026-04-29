FROM node:20-alpine

WORKDIR /app

# Install root deps
COPY package*.json ./
RUN npm install --omit=dev

# Install client deps and build
COPY client/package*.json ./client/
RUN cd client && npm install

COPY . .
RUN npm run build:client

EXPOSE 8080
CMD ["node", "server.js"]
