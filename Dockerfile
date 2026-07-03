# Official Node.js LTS image use kar rahe hain
FROM node:22-slim

# Container ke andar workspace directory create aur set kar rahe hain
WORKDIR /usr/src/app

# Package dependency files ko copy kar rahe hain
COPY package*.json ./

# Production level ke package install kar rahe hain (local packages overwrite or skip devDependencies)
RUN npm install --omit=dev

# Baaki saare files copy kar rahe hain
COPY . .

# Port expose kar rahe hain jo hamare application ke liye dynamic option ke sath work karega
ENV PORT=3000
EXPOSE 3000

# App start karne ki command
CMD [ "node", "server.js" ]
