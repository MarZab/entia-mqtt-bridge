import {DateTime} from "luxon";

export function log(topic: string, message: string) {
    console.log(`[${DateTime.now().toFormat("HH:mm:ss")}] ${topic}: ${message}`)
}