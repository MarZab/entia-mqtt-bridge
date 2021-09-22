#!/usr/bin/with-contenv bashio
set +u

export ENTIA_USERNAME=$(bashio::config 'entia_username')
export ENTIA_PASSWORD=$(bashio::config 'entia_password')
export MQTT_USERNAME=$(bashio::config 'mqtt_username')
export MQTT_PASSWORD=$(bashio::config 'mqtt_password')
export MQTT_HOSTNAME=$(bashio::config 'mqtt_hostname')

node --version

bashio::log.info "Starting Entia MQTT Bridge"
yarn run start