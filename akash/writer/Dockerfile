# akash/writer/Dockerfile — i5: containerize the verdict WRITER service.
#
# Build context is the REPO ROOT (so it can copy memory/ and schema/):
#   docker build -f akash/writer/Dockerfile -t <user>/benchfirst-writer:v1 .
#
# amd64-pinned because Akash providers are x86_64 (matches the preflight image).
FROM --platform=linux/amd64 node:20-slim

WORKDIR /app

# Deps first (cache layer): the writer needs only ajv + the S3 client — NOT the
# Bedrock SDK (that lives on the loop/picker side, which does not run in here).
COPY akash/writer/package.json ./package.json
RUN npm install --omit=dev && npm cache clean --force

# App code. Copy ONLY the writer's source modules — never memory/memory.json,
# so no repo-state scar data is baked into the image (cold start stays cold).
# writer.mjs reads ../schema/verdict.json relative to memory/, so schema/ must
# sit next to memory/ (i.e. /app/schema + /app/memory).
COPY memory/*.mjs ./memory/
COPY schema/ ./schema/

ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    BENCHFIRST_WRITER_HOST=0.0.0.0 \
    BENCHFIRST_WRITER_PORT=8787
# i7 sets at deploy (never baked into the image):
#   BENCHFIRST_S3_BUCKET, BENCHFIRST_S3_KEY  — durable scar file
#   BENCHFIRST_VERDICT_IDENTITY              — turns the identity backstop ON (fail-closed)
#   AWS_* / role creds                       — scoped s3:PutObject for the writer identity only

EXPOSE 8787

# Liveness: the public /healthz endpoint (returns {ok:true}, no store leak).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.BENCHFIRST_WRITER_PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "memory/writer.mjs"]
