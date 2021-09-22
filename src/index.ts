import {Entia, EntiaError} from "./entia"
import {DeviceType} from "./entia.interfaces"
import {MQTT} from "./mqtt";
import {log} from "./helpers";

const mqttClient = new MQTT("entia");
const entiaClient = new Entia();

async function stop() {
    try {
        await mqttClient.stop(true);
    } catch (e) {
        log("MQTT", e.toString());
    }
    process.exit();
}

async function handleException(e: Error | EntiaError) {
    try {
        log("BRIG", e.toString());
    } finally {
        await stop();
    }
}

const deviceMeta = {
    identifiers: ["entia-one"],
    manufacturer: "Entia",
    model: "Entia",
    name: "Entia"
};

(async () => {
    await mqttClient.connect();

    // start entia
    entiaClient.loop(async (devices) => {
        log("Enti", "Setup");
        for (const [id, {label, type, slug}] of Object.entries(devices)) {

            switch (type) {
                case DeviceType.cover: {
                    const prefix = `homeassistant/${slug}`;
                    await mqttClient.publish(`${prefix}/config`, JSON.stringify({
                        "name": label,
                        "unique_id": `entia_${id}`,

                        // position
                        "position_topic": `${prefix}/state`,
                        "set_position_topic": `${prefix}/set`,
                        "position_template": `{{value_json.current}}`,

                        "device": deviceMeta
                    }), {retain: false});
                    await mqttClient.subscribe(`${prefix}/set`);
                    break;
                }
                case DeviceType.dim: {
                    const prefix = `homeassistant/${slug}`;
                    await mqttClient.publish(`${prefix}/config`, JSON.stringify({
                        "name": label,
                        "unique_id": `entia_${id}`,
                        "schema": "json",

                        // on/off
                        "state_topic": `${prefix}/state`,
                        "command_topic": `${prefix}/set`,

                        // brightness
                        "brightness": true,
                        "color_mode": true,
                        "supported_color_modes": ["brightness"],
                        "brightness_scale": 100,

                        "device": deviceMeta
                    }), {retain: false});
                    await mqttClient.subscribe(`${prefix}/set`);
                    break;
                }
                case DeviceType.fan:
                case DeviceType.light: {
                    const prefix = `homeassistant/${slug}`;
                    await mqttClient.publish(`${prefix}/config`, JSON.stringify({
                        "name": label,
                        "unique_id": `entia_${id}`,
                        "command_topic": `${prefix}/set`,
                        "state_topic": `${prefix}/state`,
                        "state_value_template": `{{value_json.state}}`,
                        "device": deviceMeta
                    }), {retain: false});
                    await mqttClient.subscribe(`${prefix}/set`);
                    break;
                }
            }
        }
    }, async (states) => {
        for (const [slug, state] of Object.entries(states)) {
            await mqttClient.publish(`homeassistant/${slug}/state`, JSON.stringify(state), {retain: false});
        }
    }).then(() => {
        log("Enti", "Stopped");
    }).catch(handleException);

    const entiaRegex = /^homeassistant\/[^\/]+\/entia_([0-9]+)\/set$/;

    // listen to events from HASS
    mqttClient.listen((topic, payload, packet) => {
        log("MQTT", `${topic}: ${payload}`);
        const entiaId = entiaRegex.exec(topic);
        if (entiaId) {
            entiaClient.set(entiaId[1], payload.toString());
        }
    });


})().catch(handleException);

process.on('SIGINT', stop);