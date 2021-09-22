import got from "got";

import {DeviceType, EntiaMessage} from "./entia.interfaces";
import {log} from "./helpers";

export class EntiaError extends Error {
    public code: string | undefined;

    constructor(message: string, code?: string) {
        super(message);
        this.code = code;
    }
}

export type Device = { type: DeviceType, label: string, id: string, slug: string };

export class Entia {

    private readonly username;
    private readonly password;

    private _stop = false;
    private queue: { command: string, extras?: string, deviceId?: string }[];
    private devices: Record<string, Device> = {};
    private states: Record<string, Record<string, string | number>> = {};

    constructor(
        username?: string,
        password?: string
    ) {
        this.username = username || process.env.ENTIA_USERNAME;
        this.password = password || process.env.ENTIA_PASSWORD;
        if (!this.username || !this.password) {
            throw new EntiaError("Username or password not set");
        }
    }

    public async loop(setup: (devices: Record<string, Device>) => Promise<void>, notify: (states: Record<string, Record<string, string | number>>) => Promise<void>) {

        this._stop = false;
        this.devices = {};
        this.queue = [];

        let sessionID: string;
        let pipeID: string | null;

        let connected = false;
        let counter = 1;
        // STEP 1
        let message = `[{"cmd":"CONNECT","chl":1,"params":{"name":null, "time":"${(new Date).getTime()}"}}]`;

        while (true) {

            let responseData: EntiaMessage.Message[];
            try {
                const response = await got.get(`https://ape.entia.si/2/?${message}`, {
                    headers: {
                        Accept: '*/*',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Host': 'ape.entia.si',
                        'Pragma': 'no-cache',
                        'Referer': 'https://dostop.entia.si/',
                        'sec-ch-ua': '"Google Chrome";v="89", "Chromium";v="89", ";Not A Brand";v="99"',
                        'sec-ch-ua-mobile': "?0",
                        'Sec-Fetch-Dest': 'script',
                        'Sec-Fetch-Mode': 'no-cors',
                        'Sec-Fetch-Site': 'same-site',
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36',
                    }
                })
                const match = /^Ape\.transport\.read\('(.+)'\)$/.exec(response.body)
                if (match) {
                    responseData = JSON.parse(match[1]);
                } else {
                    log("Enti", `Request: ${message}`);
                    log("Enti", `Response: ${response.body}`);
                    throw new EntiaError("Could not parse response");
                }
            } catch (e) {
                if (e instanceof EntiaError) {
                    throw e;
                }
                throw e;
            }

            for (const data of responseData) {

                log("Enti", `${data.raw} ${data.time}: ${JSON.stringify(data.data)}`);

                switch (data.raw) {

                    /**
                     * STEP 1 RESPONSE PART 1
                     */
                    case "LOGIN": {
                        sessionID = data.data.sessid;
                        pipeID = null;
                        counter = 3;
                        break;
                    }

                    /**
                     * STEP 1 RESPONSE PART 2
                     */
                    case "IDENT": {
                        if (pipeID) {
                            // second CHANNEL message (PART 3), ignore
                            break;
                        }
                        pipeID = data.data.user.pubid
                        // STEP 2
                        this.queue.push({
                            command: "FLAT_CONNECT",
                            extras: `"username":"${this.username}","password":"${this.password}"`
                        });
                        break;
                    }

                    /**
                     * STEP 2 RESPONSE
                     */
                    case "FLAT_LOGIN": {
                        connected = true;
                        // STEP 3
                        // request devices
                        this.queue.push({command: "FLAT_GET_TEMPLATE"});
                        break;
                    }

                    /**
                     * STEP 3 RESPONSE
                     */
                    case "FLAT_TEMPLATE": {
                        for (const device of data.data.msg.hause.floors.floor.rooms.room[0].elements.element) {

                            const id = device.id.toString();
                            const label = device.label;

                            if (device.type === 4 && device.subtype === 1) {
                                // ElementLight
                                this.devices[id] = {type: DeviceType.light, label, id, slug: `light/entia_${id}`};
                            } else if (device.type == 4 && device.subtype === 4) {
                                // ElementFan
                                this.devices[id] = {type: DeviceType.fan, label, id, slug: `fan/entia_${id}`};
                            } else if (device.type == 6) {
                                // ElementCover
                                this.devices[id] = {type: DeviceType.cover, label, id, slug: `cover/entia_${id}`};
                            } else if (device.type === 5) {
                                // ElementDim
                                this.devices[id] = {type: DeviceType.dim, label, id, slug: `light/entia_${id}`};
                            } else if (device.type === 11) {
                                // ElementHMI
                            } else if (device.type === 18) {
                                // ElementUrnik
                            } else {
                                log("Enti", `Unknown device: ${JSON.stringify(device)}`);
                            }
                        }

                        await setup(this.devices);

                        // STEP 4
                        // get all device data
                        this.queue.push({command: "FLAT_GET", extras: `"list":"all","extended":1`})
                        break;
                    }

                    /**
                     * STEP 4 RESPONSE
                     * On new event
                     */
                    case "FLAT_NOTIFY":
                    case "FLAT_EVENT": {
                        const devices = data.data?.msg?.response?.device;
                        if (!devices || !Array.isArray(devices)) {
                            // empty event
                            break;
                        }
                        const states: Record<string, Record<string, string | number>> = {};
                        for (const device of devices) {
                            if (!device || !device.type || !this.devices[device.id]) {
                                continue;
                            }
                            const deviceSettings = this.devices[device.id];
                            const slug = deviceSettings.slug;

                            switch (deviceSettings.type) {

                                case DeviceType.cover: {
                                    if (device.type !== 6)
                                        throw new EntiaError(`Device mismatch: ${device.id}`);
                                    const wanted: number = +device.attribute[0].val;
                                    const current: number = +device.attribute[1].val;
                                    const direction: number = device.attribute[2].val; // 0 = stopped, 1 = opening, 2 = closing

                                    let state: 'closed' | 'closing' | 'open' | 'opening' | 'stopped' = 'stopped';
                                    if (direction === 0) {
                                        state = 'stopped';
                                    } else if (direction === 1) {
                                        state = 'opening';
                                    } else if (direction === 2) {
                                        state = 'closing';
                                    }

                                    states[slug] = {current, state, wanted};
                                    break;
                                }
                                case DeviceType.fan:
                                case DeviceType.light: {
                                    if (device.type !== 4)
                                        throw new EntiaError(`Device mismatch: ${device.id}`);
                                    states[slug] = {state: device.attribute[0].val === 1 ? "ON" : "OFF"};
                                    break;
                                }
                                case DeviceType.dim: {
                                    if (device.type !== 5)
                                        throw new EntiaError(`Device mismatch: ${device.id}`);
                                    states[slug] = {
                                        state: device.attribute[0].val === 1 ? "ON" : "OFF",
                                        brightness: device.attribute[1].val
                                    };
                                    break;
                                }
                            }
                        }
                        this.states = {...this.states, ...states};

                        await notify(states);

                        break;
                    }

                    /**
                     * Something went wrong, exit
                     */
                    case "FLAT_ERROR":
                    case "ERR":
                    case "DEVICE_SET_EXT":
                    case "FLAT_DISCONNECT":
                    case "QUIT": {
                        throw new EntiaError(`Server quit '${data.raw}': ${JSON.stringify(data)}`);
                    }

                    /**
                     * These are not interesting
                     */
                    case "FLAT_WEATHER":
                    case "JOIN":
                    case "LEFT":
                    case "FLAT_HEARTBEAT":
                    case "CHANNEL":
                    case "DEVICE_SET":
                    case "FLAT_SETTING_GET":
                    case "FLAT_SET":
                    case "CLOSE": {
                        break;
                    }

                    /**
                     * Something new!
                     */
                    default: {
                        log("Enti", `Unknown message '${data.raw}': ${JSON.stringify(data)}`)
                        break;
                    }
                }
            }

            let command: string;
            let extras: string | undefined;
            if (this._stop) {
                log("Enti", "Stopping");
                return; // stop the loop gracefully
            }
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                command = next.command;
                extras = next.extras;
            } else {
                if (!connected) {
                    throw new EntiaError("Could not connect");
                }
                // nothing else to do
                command = "CHECK";
            }
            counter++;
            message = `[{"cmd":"${command}","chl":${counter},"sessid":"${sessionID}","params":{"pipe":"${pipeID}","time":"${(new Date).getTime()}"${extras ? `,${extras}` : ''}}}]`;
        }
    }

    public async stop() {
        this._stop = true;
    }


    public set(deviceId: string, payload: string) {

        const deviceSettings = this.devices[deviceId];

        if (!deviceSettings) {
            log("Enti", `Device ${deviceId}: ${payload}`)
            throw new EntiaError("Device does not exist");
        }

        this.queue = this.queue.filter(x=>x.deviceId !== deviceId);

        switch (deviceSettings.type) {
            case DeviceType.cover: {
                const value = parseInt(payload);
                log("Enti", `SWITCH ${deviceId} ${value}`);
                const attribute = `[{"id":1,"val":${value}}]`;
                 this.queue.push({
                    deviceId,
                    command: "DEVICE_SET",
                    extras: `"deviceid":"${deviceId}","data":{"attribute":${attribute}}`
                });
                break;
            }
            case DeviceType.dim: {
                const {state, brightness} = JSON.parse(payload);
                log("Enti", `DIM ${deviceId} ${state} ${brightness}`);
                let attribute;
                if (brightness) {
                    attribute = `[{"id":1,"val":${state === "ON" ? "1" : "0"}},{"id":2,"val":${brightness}}]`;
                } else {
                    attribute = state === 'ON' ? `[{"id":1,"val":1}]` : `[{"id":1,"val":0}]`;
                }
                this.queue.push({
                    deviceId,
                    command: "DEVICE_SET",
                    extras: `"deviceid":"${deviceId}","data":{"attribute":${attribute}}`
                });
                break;
            }
            case DeviceType.fan:
            case DeviceType.light: {
                log("Enti", `SWITCH ${deviceId} ${payload}`);
                const attribute = payload === 'ON' ? `[{"id":1,"val":1}]` : `[{"id":1,"val":0}]`;
                this.queue.push({
                    deviceId,
                    command: "DEVICE_SET",
                    extras: `"deviceid":"${deviceId}","data":{"attribute":${attribute}}`
                });
                break;
            }
        }

    }


}