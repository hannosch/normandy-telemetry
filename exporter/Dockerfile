FROM node:8-slim

# add a non-privileged user for installing and running
# the application
RUN groupadd -g 10001 app && \
    useradd -d /app -g 10001 -G app -M -s /bin/sh -u 10001 app

RUN apt-get update && apt-get install -y \
    wget \
    && apt-get -y clean \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app && chown -R app:app /app

USER app
WORKDIR /app

COPY ./package.json /app/package.json
RUN npm install --no-save -d /app
RUN npm dedupe

COPY . /app

CMD ["/app/run.sh"]
VOLUME /app/data
