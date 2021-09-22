ARG BUILD_FROM
FROM $BUILD_FROM

ENV LANG C.UTF-8

WORKDIR /app

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Setup
RUN apk add --no-cache nodejs yarn git

# copy installer cache files
COPY package.json yarn.lock .pnp.js .yarnrc.yml /app/
COPY .yarn /app/.yarn

RUN yarn install --immutable

# Copy data for add-on
COPY . /app

RUN chmod a+x run.sh
CMD [ "/app/run.sh" ]