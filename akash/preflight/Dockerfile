FROM --platform=linux/amd64 mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
COPY harness.mjs target.html ./

RUN npm init -y && npm install playwright@1.47.0 http-server

ENV NODE_NO_WARNINGS=1

CMD ["/bin/bash", "-c", "npx http-server . -p 8080 -s & sleep 3 && node harness.mjs 2>&1 && echo '=== HARNESS DONE ===' && sleep 3600"]
