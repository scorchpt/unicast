import { MediaSource, MediaSourceDetails } from "../MediaSource";
import { ProvidersManager } from "../ProvidersManager";
import { IMediaRepository } from "../../MediaRepositories/BaseRepository/IMediaRepository";
import { UnicastServer } from "../../UnicastServer";
import { IEntity } from "../../EntityFactory";

export interface IMediaProviderFactory<P extends IMediaProvider> {
    load () : Promise<P[]>;
}

export interface IMediaProvider extends IEntity {
    server : UnicastServer;

    readonly name : string;
    
    readonly type : string;

    getMediaRepositories () : IMediaRepository[];

    cacheKey ( source : MediaSourceDetails ) : string;

    match ( source : string ) : boolean;

    make ( manager : ProvidersManager, source : MediaSourceDetails ) : MediaSource;

    open ( manager : ProvidersManager, source : MediaSourceDetails ) : Promise<MediaSource>;
}