export enum DeviceType {
    light = 'light',
    cover = 'cover',
    fan = 'fan',
    dim = 'dim',
}

export namespace EntiaMessage {

    export type Message = Ident | Login | Channel | FlatLogin | FlatTemplate | FlatNotify | Untyped | FlatError;

    interface BaseMessage {
        time: string;
        raw: string;
        data: any;
    }

    /**
     *  @example
     *    {"time":"1632294051","raw":"IDENT","data":{"user":{"casttype":"uni","pubid":"..."}}}
     */
    export interface Ident extends BaseMessage {
        raw: "IDENT";
        data: {
            user: {
                casttype: "uni";
                pubid: string
            }
        }
    }

    /**
     *  @example
     *    {"time":"1632294051","raw":"LOGIN","data":{"sessid":"..."}}
     */
    export interface Login extends BaseMessage {
        time: string;
        raw: "LOGIN";
        data: { sessid: string }
    }

    /**
     * @example
     *   {
     *     "time": "1632294051",
     *     "raw": "CHANNEL",
     *     "data": {
     *         "users": [{"casttype":"uni", "pubid":"...", "level":1}],
     *         "pipe": {
     *             "casttype": "multi",
     *             "pubid": "...",
     *             "properties": {"name":"..."}
     *         }
     *     }
     *   }
     */
    export interface Channel extends BaseMessage {
        time: string;
        raw: "CHANNEL";
        data: {
            users: { casttype: "multi", pubid: string, level: number }[]
            pipe: {
                casttype: "multi",
                pubid: string;
                properties: {
                    name: string
                }
            }
        }
    }

    /**
     *  @example
     *   {"time":"1632294051","raw":"FLAT_LOGIN","data":{"flatid":"297","sessionkey":"...","login_hash":"..."}}];
     */
    export interface FlatLogin extends BaseMessage {
        time: string;
        raw: "FLAT_LOGIN";
        data: {
            flatid: string;
            sessionkey: string;
            login_hash: string;
        }
    }

    /**
     *
     */
    export interface FlatTemplate extends BaseMessage {
        time: string;
        raw: "FLAT_TEMPLATE";
        data: {
            msg: {
                hause: {
                    city: {
                        name: string;
                        weather_code: string;
                        time_zone: string;
                        time_zone_code: string;
                    },
                    floors: {
                        floor: {
                            label: string;
                            rooms: {
                                room: {
                                    elements: {
                                        element: Element[]
                                    },
                                    scenes: {
                                        scene: {
                                            Label: "Away" | "Day" | "Night" | "Morning" | "Cosy" | "Evening",
                                            id: number
                                        }
                                    }
                                }[]
                            }
                        }
                    }
                }
            }
        }
    }

    export type Element = ElementLight | ElementDim | ElementFan | ElementHMI | ElementCover | ElementUrnik;

    interface BaseElement {
        label: string;
        type: number;
        id: number;
        isflatdevice: 0; // ??
    }

    export interface ElementLight extends BaseElement {
        type: 4;
        subtype: 1
    }

    export interface ElementDim extends BaseElement {
        type: 5;
    }

    export interface ElementCover extends BaseElement {
        type: 6;
        subtype: 1
    }

    export interface ElementFan extends BaseElement {
        type: 4;
        subtype: 4
    }

    // ??
    export interface ElementHMI extends BaseElement {
        type: 11;
    }

    export interface ElementUrnik extends BaseElement {
        type: 18;
    }

    /**
     * Flat Notify
     */
    export interface FlatNotify extends BaseMessage {
        raw: "FLAT_NOTIFY" | "FLAT_EVENT";
        data: {
            msg: {
                response: {
                    device: Notify[];
                }
            }
        }
    }

    export type Notify = NotifyUrnik | NotifyDim | NotifyToogle | NotifyHMI | NotifyCover;

    interface BaseNotify {
        id: number;
        type: number;
    }

    export interface NotifyCover extends BaseNotify {
        type: 6;
        attribute: [
            { id: 1, val: number },
            { id: 2, val: number },
            { id: 3, val: number },
            { id: 4, val: number },
            { id: 5, val: number },
        ];
        setting: 0;
    }

    export interface NotifyToogle extends BaseNotify {
        type: 4;
        attribute: [
            { id: 1, val: number }
        ];
        setting: 0;
    }

    export interface NotifyHMI extends BaseNotify {
        type: 11;
        attribute: { id: number, val: number }[];
        setting: { id: number, val: number }[];
        scenes: {
            scene: {
                id: number;
                device: {
                    id: number;
                    type: number;
                    attribute: { id: number, val: number }[];
                }[]
            }[]
        }
    }

    export interface NotifyDim extends BaseNotify {
        type: 5;
        attribute: [
            { id: 0, val: number }, // on/off
            { id: 1, val: number }, // % light
        ];
        setting: 0;
    }

    export interface NotifyUrnik extends BaseElement {
        type: 18;
        attribute: 0;
        setting: 0;
        schedule: {
            day: {
                d: number;
                regime: {r: number; f: number; t:number; v:number;}[]
            }[]
            enabled: number;
            data_type: 3;
        }
    }

    export interface Untyped extends BaseMessage {
        raw: "FLAT_WEATHER" | "JOIN" | "LEFT" | "FLAT_HEARTBEAT" | "DEVICE_SET" | "FLAT_SETTING_GET" | "BREAK" | "FLAT_SET" | "CLOSE"
    }


    export interface FlatError extends BaseMessage {
        raw: "FLAT_ERROR" | "ERR" | "DEVICE_SET_EXT" | "FLAT_DISCONNECT" | "QUIT";
    }


}