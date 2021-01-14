import { MediaSource } from "../../../MediaProviders/MediaSource";
import { MediaStream } from "../../../MediaProviders/MediaStreams/MediaStream";
import { MediaRecord, CustomMediaRecord, MediaKind, PlayableQualityRecord, MediaRecordArt } from "../../../MediaRecord";
import * as isSubtitle from 'is-subtitle';
import * as isVideo from 'is-video';
import * as path from 'path';
import * as fs from 'mz/fs';
import { FileSystemVideoMediaStream } from "./MediaStreams/FileSystemVideoStream";
import { FileSystemSubtitlesMediaStream } from "./MediaStreams/FileSystemSubtitlesStream";
import { MediaTools } from "../../../MediaTools";

export class FileSystemMediaSource extends MediaSource {
    async scan () : Promise<MediaStream[]> {
        const file : string = this.details.id;

        const streams : MediaStream[] = [];

        if ( !( await fs.exists( file ) ) ) {
            return [];
        }

        if ( isVideo( file ) ) {
            const metadata = await MediaTools.probe( file );

            streams.push( new FileSystemVideoMediaStream( file, this, metadata ) );

            // TODO Re-enable embedded subtitle streams
            // const subtitles = metadata.tracks.filter( track => track.type == 'subtitle' );

            // for ( let track of subtitles ) {
            //     // TODO Read metadata here and create embedded subtitle streams
            //     streams.push( new FileSystemEmbeddedSubtitleStream( this, `${file}?${track.index}`, this.source, track ) );
            // }

            const folder = path.dirname( file );

            const filePrefix = path.basename( file, path.extname( file ) );

            const otherFiles = await fs.readdir( folder );
            
            const matchingFiles = otherFiles
                .filter( file => file.startsWith( filePrefix ) )
                .filter( file => isSubtitle( file ) );

            for ( let file of matchingFiles ) {
                streams.push( new FileSystemSubtitlesMediaStream( path.join( folder, file ), this ) );
            }
        }

        if ( isSubtitle( file ) ) {
            streams.push( new FileSystemSubtitlesMediaStream( file, this ) );
        }

        return streams;
    }

    getArt ( property : string ) : Promise<NodeJS.ReadableStream> {
        return null;
    }

    async getArtUrl ( property : string ) {
        return null;
    }

    async info () : Promise<MediaRecord> {
        if ( this.details.record ) {
            return this.details.record;
        }

        let runtime = null;

        let quality : PlayableQualityRecord = {
            codec: null,
            releaseGroup: null,
            resolution: null,
            source: null
        };

        let art : MediaRecordArt = {
            thumbnail: null,
            background: null,
            banner: null,
            poster: null
        };

        if ( isVideo( this.details.id ) ) {
            const metadata = await MediaTools.probe( this.details.id );

            const video = metadata.tracks.find( stream => stream.type == 'video' );
            
            runtime = video.duration;

            quality.codec = video.codec;
            quality.resolution = '' + video.height + 'p';
        }

        let rest : Partial<MediaRecord> = {};

        if ( this.details.scraper ) {
            rest = await this.provider.server.scrapers.parse( this.details.scraper, this.details.id ) || {};
        }

        return {
            art: art,
            external: {},
            internalId: null,
            kind: MediaKind.Custom,
            repository: null,
            title: path.basename( this.details.id ),
            ...rest,
            watched: false,
            addedAt: new Date(),
            runtime: runtime,
            lastPlayedAt: null,
            playCount: 0,
            quality: quality
        } as CustomMediaRecord;
    }
}