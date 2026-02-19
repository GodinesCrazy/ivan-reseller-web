FROM node:20
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
# Must listen on PORT (Railway injects it) and 0.0.0.0
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "run", "start"]
