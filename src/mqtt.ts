import {connect, Client, IClientPublishOptions, OnMessageCallback} from "mqtt";
import {log} from "./helpers";

export class MQTT {

    private readonly client_id: string;
    private readonly username: string;
    private readonly password: string;
    private readonly hostname: string;

    constructor(
        private prefix: string,
        username?: string,
        password?: string,
        hostname?: string,
    ) {
        this.client_id = `${prefix}_${Math.random().toString(16).substr(2, 8)}`;
        this.username = username || process.env.MQTT_USERNAME;
        this.password = password || process.env.MQTT_PASSWORD;
        this.hostname = hostname || process.env.MQTT_HOSTNAME;

        if (!this.username || !this.password || !this.hostname) {
            log("MQTT", "You must set a mqtt username and password in the addon config")
            process.exit(22);
        }
    }

    private client: Client;

    public isConnected() {
        return this.client?.connected;
    }

    public async connect() {
        let resolved = false;
        return new Promise((resolve, reject) => {
            if (!this.client) {
                try {
                    this.client = connect(`mqtt://${this.hostname}`, {
                        clientId: this.client_id,
                        username: this.username,
                        password: this.password
                    });
                } catch (e) {
                    reject(e);
                }
                this.client.on("connect", (packet) => {
                    log("MQTT", `Connected ${this.client_id}`);
                    // log("MQTT", `${JSON.stringify(packet)}`);
                    if (!resolved) {
                        resolve(this.client);
                    } else {
                        log("MQTT", `Reconnected ${this.client_id}`);
                    }
                });
            } else {
                resolve(this.client);
            }
        });
    }

    public async stop(force: boolean) {
        return new Promise((resolve, reject) => {
            this.client.end(force, () => {
                log("MQTT", `Disconnected ${this.client_id}`);
                this.client = undefined;
                resolve(null);
            });
        });
    }

    public async subscribe(topic: string) {
        return new Promise((resolve, reject) => {
            this.client.subscribe(topic, (error, grant)=>{
                if (error) {
                    reject(error);
                } else {
                    resolve(grant);
                }
            });
        });
    }

    public listen(func: OnMessageCallback) {
        this.client.on("message", func);
    }

    public async publish(topic: string, message: string, settings: IClientPublishOptions) {
        log("MQTT", `Publish '${topic}' ${message}`);
        // log("MQTT", `Publish '${topic}' `);
        return new Promise((resolve, reject) => {
            this.client.publish(topic, message, settings, (e, p) => {
                if (e) {
                    log("MQTT", `Error ${e.toString()}`);
                    reject(e);
                } else {
                    resolve(p);
                }
            });
        })
    }

}

