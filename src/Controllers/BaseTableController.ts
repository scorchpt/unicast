import { CompiledQuery, QueryAst, QueryLang, QuerySemantics } from '../QueryLang';
import { BaseController, Route } from "./BaseController";
import { BaseTable } from "../Database/Database";
import { Response, Request } from "restify";
import { ResourceNotFoundError, NotAuthorizedError, InvalidArgumentError } from "restify-errors";
import * as regexEscape from 'regex-escape';
import * as r from 'rethinkdb';

export abstract class BaseTableController<R, T extends BaseTable<R> = BaseTable<R>> extends BaseController {
    abstract readonly table : T;

    defaultSortField : string = 'title';

    defaultSortFieldDirection : 'asc' | 'desc' = 'asc';

    sortingFields : string[] = [ 'title' ];

    searchFields : string[] = [ 'title' ];

    allowedActions : string[] = [ 'list', 'get', 'create', 'update', 'delete' ];

    getSearchQuery ( search : string, query : r.Sequence ) : r.Sequence {
        if ( this.searchFields.length === 0 ) {
            return query;
        }

        const regex = '(?i)' + regexEscape( search );

        return query.filter( doc => {
            let conditional = doc;

            for ( let [ index, field ] of this.searchFields.entries() ) {
                if ( index === 0 ) {
                    conditional = ( doc as any )( field ).match( regex );
                } else {
                    conditional = conditional.or( ( doc as any )( field ).match( regex ) );
                }
            }

            return conditional;
        } );
    }

    getQuery ( req : Request, res : Response, query : r.Sequence ) : r.Sequence {
        const reqQuery: RequestQuery<R> = req.query;

        if ( reqQuery.filterSort ) {
            let sort = typeof reqQuery.filterSort === 'string' ?
                { field: reqQuery.filterSort, direction: 'asc' } :
                { direction: 'asc', ...reqQuery.filterSort };

            if ( !this.sortingFields.includes( sort.field ) ) {
                throw new InvalidArgumentError( `Invalid sort field "${ sort.field }" requested.` );
            }

            if ( sort.direction == 'desc' ) {
                query = query.orderBy( { index: r.desc( sort.field ) } );
            } else {
                query = query.orderBy( { index: r.asc( sort.field ) } );
            }
        } else if ( this.defaultSortField ) {
            if ( this.defaultSortFieldDirection === 'desc' ) {
                query = query.orderBy( { index: r.desc( this.defaultSortField ) } );
            } else {
                query = query.orderBy( { index: this.defaultSortField } );
            }
        }

        if ( reqQuery.search?.body ) {
            query = this.getSearchQuery( reqQuery.search.body, query );
        }

        return query;
    }

    getPagination ( req : Request, res : Response, query : r.Sequence ) : r.Sequence {
        if ( req.query.skip ) {
            query = query.skip( +req.query.skip );
        }

        if ( req.query.take && req.query.take !== Infinity ) {
            query = query.limit( +req.query.take );
        }

        return query;
    }

    async transformQuery ( req : Request ) : Promise<void> {
        // The query object before transformation
        const rawQuery: RawRequestQuery = req.query;

        // The query object after transformation
        const query: RequestQuery<R> = req.query;

        if ( rawQuery.search ) {
            const parsedQuery = QueryLang.embeddedParse( rawQuery.search );

            query.search = {
                body: parsedQuery.body
            };
            
            if ( parsedQuery.embeddedQuery != null ) {
                query.search.embeddedQueryAst = QueryLang.parse( parsedQuery.embeddedQuery );
                query.search.embeddedQuerySemantics = this.createCustomQuerySemantics( req, query.search.embeddedQueryAst ) || new QuerySemantics();
                query.search.embeddedQuery = QueryLang.compile( query.search.embeddedQueryAst, query.search.embeddedQuerySemantics );
            }
        }
    };

    public createCustomQuerySemantics ( req: Request, ast: QueryAst ) : QuerySemantics | null {
        return null;
    }

    async transformAll ( req : Request, res : Response, items : R[] ) : Promise<any[]> {
        return items;
    }

    async transform ( req : Request, res : Response, item : R ) : Promise<any> {
        return item;
    }

    async transformDocument ( req : Request, res : Response, item : any, isNew : boolean ) : Promise<any> {
        return item;
    }

    runTransforms ( req : Request, res : Response, item : R ) : Promise<R>;
    runTransforms ( req : Request, res : Response, item : R[] ) : Promise<R[]>;
    async runTransforms ( req : Request, res : Response, item : R | R[] ) : Promise<R | R[]> {
        if ( !( item instanceof Array ) ) {
            return ( await this.runTransforms( req, res, [ item ] ) )[ 0 ];
        }

        item = await this.transformAll( req, res, item );

        return Promise.all( item.map( each => this.transform( req, res, each ) ) );
    }

    public async runCustomQuery ( req : Request, items : R[] ) : Promise<R[]> {
        const query: RequestQuery<R> = req.query;

        const embeddedQuery = query?.search?.embeddedQuery;

        if ( embeddedQuery ) {
            return items.filter( record => embeddedQuery( record ) != false );
        }

        return items;
    }

    public createQuery ( req : Request, res : Response, query : ( query : r.Sequence ) => r.Sequence ) : Promise<R[]> {
        return this.table.find( query );
    }

    @Route( 'get', '/' )
    async list ( req : Request, res : Response ) : Promise<R[]> {
        if ( !this.allowedActions.includes( 'list' ) ) {
            throw new NotAuthorizedError();
        }
        
        await this.transformQuery( req );

        let skip = +( req.query.skip || 0 );
        let take = +( req.query.take || Infinity );
        
        const result: R[] = [];

        let nextBatchSkip = skip;
        
        while ( true ) {
            req.query = { ...req.query, skip: nextBatchSkip, take: take };

            // Query the database
            let partialList = await this.createQuery( req, res, query => this.getPagination( req, res, this.getQuery( req, res, query ) ) );

            // Mark each record with their real index
            for ( let [ index, record ] of partialList.entries() ) record[ '$index' ] = nextBatchSkip + index;

            nextBatchSkip += partialList.length;

            const hasNoMore = partialList.length < take;

            partialList = await this.runCustomQuery( req, partialList );
    
            if ( partialList.length + result.length > take ) {
                partialList = partialList.slice( 0, take - result.length );
            }

            result.push( ...partialList );

            if ( hasNoMore || result.length >= take ) break;
        }

        return this.runTransforms( req, res, result );
    }

    @Route( 'get', '/:id', null, true )
    async get ( req : Request, res : Response ) : Promise<R> {
        if ( !this.allowedActions.includes( 'get' ) ) {
            throw new NotAuthorizedError();
        }

        const item : R = await this.table.get( req.params.id );

        if ( !item ) {
            throw new ResourceNotFoundError( `Could not find resource with id "${ req.params.id }".` );
        }

        return this.runTransforms( req, res, item );
    }

    @Route( 'post', '/' )
    async create ( req : Request, res : Response ) : Promise<R> {
        if ( !this.allowedActions.includes( 'create' ) ) {
            throw new NotAuthorizedError();
        }

        const body = await this.transformDocument( req, res, typeof req.body === 'string' ? JSON.parse( req.body ) : req.body, true );

        const item : R = await this.table.create( body );

        if ( !item ) {
            throw new ResourceNotFoundError( `Could not find resource with id "${req.params.id}".` );
        }

        return this.runTransforms( req, res, item );
    }

    @Route( 'post', '/:id', null, true )
    async update ( req : Request, res : Response ) : Promise<R> {
        if ( !this.allowedActions.includes( 'update' ) ) {
            throw new NotAuthorizedError();
        }

        const body = this.transformDocument( req, res, typeof req.body === 'string' ? JSON.parse( req.body ) : req.body, false );

        const item : R = await this.table.update( req.params.id, body );

        if ( !item ) {
            throw new ResourceNotFoundError( `Could not find resource with id "${ req.params.id }".` );
        }

        return this.runTransforms( req, res, item );
    }

    @Route( 'del', '/:id', null, true )
    async delete ( req : Request, res : Response ) : Promise< { success : boolean } > {
        if ( !this.allowedActions.includes( 'delete' ) ) {
            throw new NotAuthorizedError();
        }

        const success : boolean = await this.table.delete( req.params.id );

        if ( !success ) {
            throw new ResourceNotFoundError( `Could not find resource with id "${ req.params.id }".` );
        }

        return { success };
    }
}

interface RawRequestQuery {
    skip?: string;
    take?: string;
    search?: string;
};

export interface RequestQuery<R> {
    skip?: number;
    take?: number;
    search?: {
        body: string;
        embeddedQuery?: CompiledQuery<R>;
        embeddedQueryAst?: QueryAst;
        embeddedQuerySemantics?: QuerySemantics<R>;
    };
    filterSort?: string | {
        direction?: 'asc' | 'desc';
        field?: string;
    }
};