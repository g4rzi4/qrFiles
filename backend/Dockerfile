FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

RUN mkdir -p uploads/originals uploads/qr_pdfs uploads/qr_images

EXPOSE 3000

CMD ["node", "server.js"]
