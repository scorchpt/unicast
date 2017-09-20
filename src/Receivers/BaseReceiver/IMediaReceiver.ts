import { MediaRecord, MediaKind } from "../../MediaRecord";
import { UnicastServer } from "../../UnicastServer";
import { MediaSessionsManager } from "./MediaSessionsManager";

export enum ReceiverStatusState {
    Stopped = 'STOPPED',
    Playing = 'PLAYING',
    Paused = 'PAUSED',
    Buffering = 'BUFFERING'
}

export interface ReceiverStatus {
    session : string;
    timestamp : Date;
    state : ReceiverStatusState;
    media : {
        time : ReceiverTimeStatus;
        record : MediaRecord;
    }
    volume : ReceiverVolumeStatus;
    subtitlesStyle : ReceiverSubtitlesStyleStatus;
}

export interface ReceiverTimeStatus {
    current : number;
    duration : number;
}

export interface ReceiverVolumeStatus {
    level : number;
    muted : boolean;
}

export interface ReceiverSubtitlesStyleStatus {
    size : number;
}

export interface MediaPlayOptions {
    autostart ?: boolean;
    startTime ?: number;
    mediaId ?: string;
    mediaKind ?: MediaKind;
    playlistId ?: string;
    playlistPosition ?: number;
}

export interface IMediaReceiver {
    readonly connected : boolean;

    readonly name : string;

    readonly type : string;

    readonly server : UnicastServer;

    readonly sessions : MediaSessionsManager;

    connect () : Promise<boolean>;

    disconnect () : Promise<boolean>;

    reconnect () : Promise<boolean>;


    play ( session : string ) : Promise<ReceiverStatus>;

    pause () : Promise<ReceiverStatus>;

    resume () : Promise<ReceiverStatus>;

    stop () : Promise<ReceiverStatus>;

    status () : Promise<ReceiverStatus>;

    callCommand<R = ReceiverStatus, A = any[]> ( commandName : string, args : A ) : Promise<R>;

    toJSON () : any;
}