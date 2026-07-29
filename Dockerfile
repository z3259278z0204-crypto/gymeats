# GymEats 執行環境：Node 22
FROM node:22-slim

WORKDIR /app

# 先裝相依套件（利用快取）
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# 複製其餘程式
COPY . .

# 應用程式監聽的埠（config.js 讀 PORT）
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
