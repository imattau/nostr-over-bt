FROM node:20-alpine

WORKDIR /app

# Copy root package files for library linking
COPY package.json package-lock.json ./
COPY src ./src
COPY src/core ./src/core
COPY src/transport ./src/transport
COPY src/interfaces ./src/interfaces

# Copy relay app
COPY apps/relay/package.json apps/relay/
WORKDIR /app/apps/relay
RUN npm install

COPY apps/relay/src ./src

EXPOSE 8080 8081
CMD ["npm", "start"]
