import { BaseTableController } from "../../BaseTableController";
import { Request } from "restify";
import * as r from 'rethinkdb';
import { MediaKind } from "../../../MediaRecord";

export abstract class MediaTableController<R> extends BaseTableController<R> {
    getWatchedQuery ( req : Request, query : r.Sequence ) : r.Sequence {
        if ( req.query.watched === 'include' ) {
            query = query.filter( { watched: true } );
        } else if ( req.query.watched === 'exclude' ) {
            query = query.filter( { watched: false } );
        }

        return query;
    }

    getGenresQuery ( req : Request, query : r.Sequence ) : r.Sequence {
        if ( typeof req.query.genres === 'object' ) {
            const genres = Object.keys( req.query.genres );

            const included = genres.filter( genre => req.query.genres[ genre ] === 'include' );
            const excluded = genres.filter( genre => req.query.genres[ genre ] === 'exclude' );

            query = query.filter( ( doc ) => {
                return doc( "genres" ).setIntersection( included ).isEmpty().not().and(
                    doc( "genres" ).setIntersection( excluded ).isEmpty()
                );
            } );
        }

        return query;
    }

    getCollectionsQuery ( req : Request, query : r.Sequence ) : r.Sequence {
        if ( typeof req.query.collections === 'object' ) {
            const collections = Object.keys( req.query.collections );

            const included = collections.filter( collection => req.query.collections[ collection ] === 'include' );
            const excluded = collections.filter( collection => req.query.collections[ collection ] === 'exclude' );

            if ( included.length > 0 || excluded.length > 0 ) {
                query = query.merge( ( record ) => {
                    const collections = this.server.database.tables.collectionsMedia.query()
                        .getAll( [ record( 'kind' ), record( 'id' ) ], { index: 'reference' } )
                        .map( a => a( 'collectionId' ) ).coerceTo( 'array' )

                    return { collections };
                } ).filter( ( doc : any ) => {
                    return doc( "collections" ).setIntersection( included ).isEmpty().not().and(
                        doc( "collections" ).setIntersection( excluded ).isEmpty()
                    );
                } ).without( 'collections' );
                
            }
        }

        return query;
    }

    cacheArtwork ( kind : MediaKind, id : string, art : any, prefix ?: string[] ) : any {
        const cached : any = {};

        for ( let key of Object.keys( art ) ) {
            if ( typeof art[ key ] === 'string' ) {
                cached[ key ] = `http://192.168.0.4:3030/api/media/artwork/${ kind }/${ id }/${ [ ...(prefix || [] ), key ].join( '.' ) }`;
            } else if ( art[ key ] && typeof art[ key ] === 'object' ) {
                cached[ key ] = this.cacheArtwork( kind, id, art[ key ], [ ...( prefix || [] ), key ] );
            } else {
                cached[ key ] = art[ key ];
            }
        }

        return cached;
    }
}