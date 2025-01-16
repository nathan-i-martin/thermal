// TODO: Replace with full Thermal npm package once I get this finished.

type TimeUnit =
    "SECONDS" |
    "MINUTES" |
    "HOURS" |
    "DAYS"
;
type TimeDelay = { amount: number, unit: TimeUnit };
type OnExpired = <T>(value: T, key: string)=>void;
type CachedValue = {
    expiration: number;
    value: any;
    onExpire?: OnExpired;
}

class TimedCache {
    private _cache = new Map<string, CachedValue>();
    private readonly _cleanupProcess: number;

    constructor() {
        this._cleanupProcess = (setInterval(() => {
            if(this._cache.size == 0) return;

            const currentDate = Date.now();
            this._cache.forEach((value, key) => {
                if (value.expiration > currentDate) return;

                this._cache.delete(key);
                value.onExpire?.(value.value, key);
            });
        }, 20 * 1000) as any);
    }

    public cache = (config: Config<any>, value: any) => {
        if(config.cacheResponse() == null) return;
        const msDelay = TimedCache.millisecondsFromTimeDelay(config.cacheResponse() as TimeDelay);
        const expiration = Date.now() + msDelay;
        const key = TimedCache.generateCacheKey(config);
        const onExpire = config.cacheResponse()?.onExpire;
        this._cache.set(key, { expiration, value, onExpire });

        // Schedule automatic deletion after TTL
        setTimeout(() => {
            if (!this._cache.has(key)) return;
            if ((this._cache.get(key)?.expiration ?? 0) > Date.now()) return;

            const cachedValue = this._cache.get(key);
            this._cache.delete(key);
            try {
                cachedValue?.onExpire?.(cachedValue.value, key);
            } catch {}
        }, msDelay);
    }

    public fetch = <T>(config: Config<T>): T | null => {
        const key = TimedCache.generateCacheKey(config);

        const cacheItem = this._cache.get(key);
        if (cacheItem == undefined) return null;

        if (cacheItem.expiration <= Date.now()) {
            this._cache.delete(key);
            cacheItem.onExpire?.(cacheItem.value, key);
            return null;
        }
        
        return cacheItem.value;
    }

    public clear = () => {
        this._cache.clear();
    }

    public close = () => {
        clearInterval(this._cleanupProcess);
        this._cache.clear();
    }

    private static generateCacheKey = (config: Config<any>) => {
        // Create a sorted options object to ensure consistent cache keys
        const options = [
            JSON.stringify(config.url()),
            JSON.stringify(config.method()),
            JSON.stringify(config.body()),
            JSON.stringify(config.header())
        ].join("-----");
        /*
        const hash = Crypto.createHash('sha1');
        hash.update(options);
        return hash.digest('hex');
        */
        return options;
    }
    private static millisecondsFromTimeDelay = (delay: TimeDelay) => {
        let amount = 0;
        switch (delay.unit) {
            case "SECONDS": amount = delay.amount; break;
            case "MINUTES": amount = delay.amount * 60; break;
            case "HOURS": amount = delay.amount * 60 * 60; break;
            case "DAYS": amount = delay.amount * 60 * 60 * 24; break;
        }
        amount *= 1000;

        return amount;
    }
}

export type ThermalError = {
    code: number;
    type: ErrorType;
    message: string;
}
export type ThermalResponse<T> = {
    data?: T;
    error?: ThermalError;
    status: "success" | "error";
}
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const ThermalErrorType = new Map<ErrorType, ThermalError>();
ThermalErrorType.set("CONTINUE",              { code: 100, type: "CONTINUE", message: "The server has received the request headers and the client should proceed to send the request body." });
ThermalErrorType.set("SWITCHING_PROTOCOLS",   { code: 101, type: "SWITCHING_PROTOCOLS", message: "The requester has asked the server to switch protocols." });
ThermalErrorType.set("PROCESSING",            { code: 102, type: "PROCESSING", message: "The server is processing the request but no response is available yet." });
ThermalErrorType.set("EARLY_HINTS",           { code: 103, type: "EARLY_HINTS", message: "Used to return some response headers before final HTTP message." });

// Successful responses (200-299)
ThermalErrorType.set("OK",                            { code: 200, type: "OK", message: "The request has succeeded." });
ThermalErrorType.set("CREATED",                       { code: 201, type: "CREATED", message: "The request has been fulfilled and has resulted in one or more new resources being created." });
ThermalErrorType.set("ACCEPTED",                      { code: 202, type: "ACCEPTED", message: "The request has been accepted for processing, message: but the processing has not been completed." });
ThermalErrorType.set("NON_AUTHORITATIVE_INFORMATION", { code: 203, type: "NON_AUTHORITATIVE_INFORMATION", message: "The server is a transforming proxy that received a 200 OK from its origin." });
ThermalErrorType.set("NO_CONTENT",                    { code: 204, type: "NO_CONTENT", message: "The server successfully processed the request, message: but is not returning any content." });
ThermalErrorType.set("RESET_CONTENT",                 { code: 205, type: "RESET_CONTENT", message: "The server is telling the user agent to reset the document which sent this request." });
ThermalErrorType.set("PARTIAL_CONTENT",               { code: 206, type: "PARTIAL_CONTENT", message: "The server is delivering only part of the resource." });
ThermalErrorType.set("MULTI_STATUS",                  { code: 207, type: "MULTI_STATUS", message: "A Multi-Status response conveys information about multiple resources." });
ThermalErrorType.set("ALREADY_REPORTED",              { code: 208, type: "ALREADY_REPORTED", message: "The members of a DAV binding have already been enumerated in a previous reply." });
ThermalErrorType.set("IM_USED",                       { code: 226, type: "IM_USED", message: "The server has fulfilled a request for the resource." });

// Redirection messages (300-399)
ThermalErrorType.set("MULTIPLE_CHOICES",      { code: 300, type: "MULTIPLE_CHOICES", message: "The request has more than one possible response." });
ThermalErrorType.set("MOVED_PERMANENTLY",     { code: 301, type: "MOVED_PERMANENTLY", message: "The URL of the requested resource has been changed permanently." });
ThermalErrorType.set("FOUND",                 { code: 302, type: "FOUND", message: "The requested resource has been temporarily moved to a different URI." });
ThermalErrorType.set("SEE_OTHER",             { code: 303, type: "SEE_OTHER", message: "The response to the request can be found under another URI using a GET method." });
ThermalErrorType.set("NOT_MODIFIED",          { code: 304, type: "NOT_MODIFIED", message: "There is no need to retransmit the requested resources." });
ThermalErrorType.set("USE_PROXY",             { code: 305, type: "USE_PROXY", message: "The requested resource is only available through a proxy." });
ThermalErrorType.set("TEMPORARY_REDIRECT",    { code: 307, type: "TEMPORARY_REDIRECT", message: "The request should be repeated with another URI." });
ThermalErrorType.set("PERMANENT_REDIRECT",    { code: 308, type: "PERMANENT_REDIRECT", message: "The request and all future requests should be repeated using another URI." });

// Client error responses (400-499)
ThermalErrorType.set("BAD_REQUEST",                       { code: 400, type: "BAD_REQUEST", message: "The server could not understand the request due to invalid syntax." });
ThermalErrorType.set("UNAUTHORIZED",                      { code: 401, type: "UNAUTHORIZED", message: "The client must authenticate itself to get the requested response." });
ThermalErrorType.set("PAYMENT_REQUIRED",                  { code: 402, type: "PAYMENT_REQUIRED", message: "The client must pay to get the requested response." });
ThermalErrorType.set("FORBIDDEN",                         { code: 403, type: "FORBIDDEN", message: "The client does not have access rights to the content." });
ThermalErrorType.set("NOT_FOUND",                         { code: 404, type: "NOT_FOUND", message: "The server can not find the requested resource." });
ThermalErrorType.set("METHOD_NOT_ALLOWED",                { code: 405, type: "METHOD_NOT_ALLOWED", message: "The method is not allowed for the requested URL." });
ThermalErrorType.set("NOT_ACCEPTABLE",                    { code: 406, type: "NOT_ACCEPTABLE", message: "The server cannot produce a response matching the list of acceptable values." });
ThermalErrorType.set("PROXY_AUTHENTICATION_REQUIRED",     { code: 407, type: "PROXY_AUTHENTICATION_REQUIRED", message: "Authentication is required for a proxy." });
ThermalErrorType.set("REQUEST_TIMEOUT",                   { code: 408, type: "REQUEST_TIMEOUT", message: "The server timed out waiting for the request." });
ThermalErrorType.set("CONFLICT",                          { code: 409, type: "CONFLICT", message: "The request could not be completed due to a conflict with the current state." });
ThermalErrorType.set("GONE",                              { code: 410, type: "GONE", message: "The requested content has been permanently deleted from server." });
ThermalErrorType.set("LENGTH_REQUIRED",                   { code: 411, type: "LENGTH_REQUIRED", message: "The server rejected the request because the Content-Length header field is not defined." });
ThermalErrorType.set("PRECONDITION_FAILED",               { code: 412, type: "PRECONDITION_FAILED", message: "The server does not meet one of the preconditions that the requester put on the request." });
ThermalErrorType.set("PAYLOAD_TOO_LARGE",                 { code: 413, type: "PAYLOAD_TOO_LARGE", message: "The request is larger than the server is willing or able to process." });
ThermalErrorType.set("URI_TOO_LONG",                      { code: 414, type: "URI_TOO_LONG", message: "The URI requested by the client is longer than the server is willing to interpret." });
ThermalErrorType.set("UNSUPPORTED_MEDIA_TYPE",            { code: 415, type: "UNSUPPORTED_MEDIA_TYPE", message: "The media format of the requested data is not supported by the server." });
ThermalErrorType.set("RANGE_NOT_SATISFIABLE",             { code: 416, type: "RANGE_NOT_SATISFIABLE", message: "The range specified by the Range header field in the request cannot be fulfilled." });
ThermalErrorType.set("EXPECTATION_FAILED",                { code: 417, type: "EXPECTATION_FAILED", message: "The server cannot meet the requirements of the Expect request-header field." });
ThermalErrorType.set("IM_A_TEAPOT",                       { code: 418, type: "IM_A_TEAPOT", message: "I'm a teapot." });
ThermalErrorType.set("MISDIRECTED_REQUEST",               { code: 421, type: "MISDIRECTED_REQUEST", message: "The request was directed at a server that is not able to produce a response." });
ThermalErrorType.set("UNPROCESSABLE_ENTITY",              { code: 422, type: "UNPROCESSABLE_ENTITY", message: "The request was well-formed but was unable to be followed due to semantic errors." });
ThermalErrorType.set("LOCKED",                            { code: 423, type: "LOCKED", message: "The resource that is being accessed is locked." });
ThermalErrorType.set("FAILED_DEPENDENCY",                 { code: 424, type: "FAILED_DEPENDENCY", message: "The request failed due to failure of a previous request." });
ThermalErrorType.set("TOO_EARLY",                         { code: 425, type: "TOO_EARLY", message: "Indicates that the server is unwilling to risk processing a request." });
ThermalErrorType.set("UPGRADE_REQUIRED",                  { code: 426, type: "UPGRADE_REQUIRED", message: "The client should switch to a different protocol." });
ThermalErrorType.set("PRECONDITION_REQUIRED",             { code: 428, type: "PRECONDITION_REQUIRED", message: "The origin server requires the request to be conditional." });
ThermalErrorType.set("TOO_MANY_REQUESTS",                 { code: 429, type: "TOO_MANY_REQUESTS", message: "The user has sent too many requests in a given amount of time." });
ThermalErrorType.set("REQUEST_HEADER_FIELDS_TOO_LARGE",   { code: 431, type: "REQUEST_HEADER_FIELDS_TOO_LARGE", message: "The server is unwilling to process the request because its header fields are too large." });
ThermalErrorType.set("UNAVAILABLE_FOR_LEGAL_REASONS",     { code: 451, type: "UNAVAILABLE_FOR_LEGAL_REASONS", message: "The resource is unavailable for legal reasons." });

// Server error responses (500-599)
ThermalErrorType.set("INTERNAL_SERVER_ERROR",             { code: 500, type: "INTERNAL_SERVER_ERROR", message: "The server has encountered a situation it doesn't know how to handle." });
ThermalErrorType.set("NOT_IMPLEMENTED",                   { code: 501, type: "NOT_IMPLEMENTED", message: "The request method is not supported by the server and cannot be handled." });
ThermalErrorType.set("BAD_GATEWAY",                       { code: 502, type: "BAD_GATEWAY", message: "The server got an invalid response." });
ThermalErrorType.set("SERVICE_UNAVAILABLE",               { code: 503, type: "SERVICE_UNAVAILABLE", message: "The server is not ready to handle the request." });
ThermalErrorType.set("GATEWAY_TIMEOUT",                   { code: 504, type: "GATEWAY_TIMEOUT", message: "The server is acting as a gateway and cannot get a response in time." });
ThermalErrorType.set("HTTP_VERSION_NOT_SUPPORTED",        { code: 505, type: "HTTP_VERSION_NOT_SUPPORTED", message: "The HTTP version used in the request is not supported by the server." });
ThermalErrorType.set("VARIANT_ALSO_NEGOTIATES",           { code: 506, type: "VARIANT_ALSO_NEGOTIATES", message: "Transparent content negotiation for the request results in a circular reference." });
ThermalErrorType.set("INSUFFICIENT_STORAGE",              { code: 507, type: "INSUFFICIENT_STORAGE", message: "The server is unable to store the representation needed to complete the request." });
ThermalErrorType.set("LOOP_DETECTED",                     { code: 508, type: "LOOP_DETECTED", message: "The server detected an infinite loop while processing the request." });
ThermalErrorType.set("NOT_EXTENDED",                      { code: 510, type: "NOT_EXTENDED", message: "Further extensions to the request are required for the server to fulfill it." });
ThermalErrorType.set("NETWORK_AUTHENTICATION_REQUIRED",   { code: 511, type: "NETWORK_AUTHENTICATION_REQUIRED", message: "The client needs to authenticate to gain network access." });

// Fetch API errors
ThermalErrorType.set("UNKNOWN_ERROR",     { code: 9000, type: "UNKNOWN_ERROR", message: "An unknown error occurred." });
ThermalErrorType.set("NETWORK_ERROR",     { code: 9001, type: "NETWORK_ERROR", message: "A network error occurred." });
ThermalErrorType.set("TIMEOUT_ERROR",     { code: 9002, type: "TIMEOUT_ERROR", message: "The request timed out." });
ThermalErrorType.set("ABORT_ERROR",       { code: 9003, type: "ABORT_ERROR", message: "The request was aborted." });
ThermalErrorType.set("CORS_ISSUE",        { code: 9004, type: "CORS_ISSUE", message: "A CORS issue occurred." });
ThermalErrorType.set("INVALID_URL_ERROR", { code: 9005, type: "INVALID_URL_ERROR", message: "The URL is invalid." });
ThermalErrorType.set("BAD_FORMAT_ERROR",  { code: 9008, type: "BAD_FORMAT_ERROR", message: "The data format is incorrect." });

type ErrorType =
    // Informational responses (100-199)
    "CONTINUE" |
    "SWITCHING_PROTOCOLS" |
    "PROCESSING" |
    "EARLY_HINTS" |

    // Successful responses (200-299)
    "OK" |
    "CREATED" |
    "ACCEPTED" |
    "NON_AUTHORITATIVE_INFORMATION" |
    "NO_CONTENT" |
    "RESET_CONTENT" |
    "PARTIAL_CONTENT" |
    "MULTI_STATUS" |
    "ALREADY_REPORTED" |
    "IM_USED" |

    // Redirection messages (300-399)
    "MULTIPLE_CHOICES" |
    "MOVED_PERMANENTLY" |
    "FOUND" |
    "SEE_OTHER" |
    "NOT_MODIFIED" |
    "USE_PROXY" |
    "TEMPORARY_REDIRECT" |
    "PERMANENT_REDIRECT" |

    // Client error responses (400-499)
    "BAD_REQUEST" |
    "UNAUTHORIZED" |
    "PAYMENT_REQUIRED" |
    "FORBIDDEN" |
    "NOT_FOUND" |
    "METHOD_NOT_ALLOWED" |
    "NOT_ACCEPTABLE" |
    "PROXY_AUTHENTICATION_REQUIRED" |
    "REQUEST_TIMEOUT" |
    "CONFLICT" |
    "GONE" |
    "LENGTH_REQUIRED" |
    "PRECONDITION_FAILED" |
    "PAYLOAD_TOO_LARGE" |
    "URI_TOO_LONG" |
    "UNSUPPORTED_MEDIA_TYPE" |
    "RANGE_NOT_SATISFIABLE" |
    "EXPECTATION_FAILED" |
    "IM_A_TEAPOT" |
    "MISDIRECTED_REQUEST" |
    "UNPROCESSABLE_ENTITY" |
    "LOCKED" |
    "FAILED_DEPENDENCY" |
    "TOO_EARLY" |
    "UPGRADE_REQUIRED" |
    "PRECONDITION_REQUIRED" |
    "TOO_MANY_REQUESTS" |
    "REQUEST_HEADER_FIELDS_TOO_LARGE" |
    "UNAVAILABLE_FOR_LEGAL_REASONS" |

    // Server error responses (500-599)
    "INTERNAL_SERVER_ERROR" |
    "NOT_IMPLEMENTED" |
    "BAD_GATEWAY" |
    "SERVICE_UNAVAILABLE" |
    "GATEWAY_TIMEOUT" |
    "HTTP_VERSION_NOT_SUPPORTED" |
    "VARIANT_ALSO_NEGOTIATES" |
    "INSUFFICIENT_STORAGE" |
    "LOOP_DETECTED" |
    "NOT_EXTENDED" |
    "NETWORK_AUTHENTICATION_REQUIRED" |

    // Fetch API errors
    "UNKNOWN_ERROR" |
    "BAD_FORMAT_ERROR" |
    "NETWORK_ERROR" |
    "TIMEOUT_ERROR" |
    "ABORT_ERROR" |
    "CORS_ISSUE" |
    "INVALID_URL_ERROR";

/**
 * Returns the error corresponding to {@link ErrorType}.
 * If {@param message} is provided, that will be used as the error message instead of the default.
 * If for some reason no error with the provided {@link ErrorType} can't be found, which should be impossible, a 9000 UNKNONW_ERROR will be returned.
 * @param type The error type to return.
 * @param message A custom message to use instead of the error's default.
 * @returns A {@link ThermalError} corresponding to the provided type.
 */
const resolveError = (type: ErrorType, message?: string): ThermalError => {
    const error = ThermalErrorType.get(type);

    if(error == undefined) return {
        code: 9000,
        type: "UNKNOWN_ERROR",
        message: message ?? "An unknown error occurred"
    }

    return {
        ...error,
        message: message ?? error.message
    }
}

const validateResponse = (response: any): boolean => {
    if (typeof response !== "object" || response === null) return false;

    if (response.status === "success")
        if (!("data" in response)) return false;
        else if (response.status === "error")
            if (!("error" in response) || !validateError(response.error)) return false;
            else return false;

    return true;
}

const validateError = (error: any): error is Error => {
    return (
        typeof error === "object" &&
        error !== null &&
        typeof error.code === "number" &&
        typeof error.type === "string" &&
        typeof error.message === "string"
    );
}

const handleErrorCallbacks = (
    config: Config<any>,
    type: ErrorType,
    message?: string
) => {
    const error: ThermalError = resolveError(type, message);

    const handler = config.onError().get(type);
    if(handler == null && config.onAnyError() == null) {
        try {
            config.onAnyOtherErrors()(error, config);
        } catch {}
        return;
    }

    try {
        handler?.(error, config);
    } catch {}
    try {
        config.onAnyError()?.(error, config);
    } catch {}
}

type PreProcessor = <T>(request: Config<T>)=>void;
type PostProcessor = <T>(response: any, request: Config<T>)=>void;
type ErrorHandler = <T>(error: ThermalError, request: Config<T>)=>void;

const Cache = new TimedCache();
let BaseUrl = "";
let PreProcessors = new Array<PreProcessor>();
let PostProcessors = new Array<PostProcessor>();
let DefaultSuccessHandler: ((response: any)=>void) | null = r=>console.log(r);
let DefaultErrorHandlers = new Map<ErrorType, ErrorHandler>();
let DefaultAnyErrorHandler: (ErrorHandler) | null = null;
let DefaultAnyOtherErrorHandler: (ErrorHandler) = e=>console.warn(e);
let DisableCache = false;

const thermalFetch = async <T>(config: Config<T>) => {
    for (const p of PreProcessors)
        try {
            await Promise.resolve(p<T>(config));
        } catch {}

    if(config.eagerResponse() != null) try {
        await Promise.resolve(config.onSuccess()?.(config.eagerResponse() as T));
    } catch {}
    if(config.cacheResponse() != null && !DisableCache) try {
        const cachedResponse = Cache.fetch<T>(config);
        if(cachedResponse == null) throw new Error();

        // Add a 10ms delay so this acts as a promise. This re-adds expected behavior pertaining to state setting.
        setTimeout(async ()=>{
            await Promise.resolve(config.onSuccess()?.(cachedResponse));
            config.onFinal()?.();
        }, 10);
        return;
    } catch {}

    const compiledHeaders: [ string, string ][] = [];
    config.header("Content-Type","application/json");
    config.header().forEach((v, k) => compiledHeaders.push([k, v]));
    
    let path = BaseUrl + config.url();
    if(config.metadata().get("NoBasePath") === true) path = config.url()+"";
    if(config.query()?.size > 0) path = `${path}?${Array.from(config.query()).map(e=>(`${e[0]}=${e[1]}`)).join("&") ?? ""}`;

console.log(path);

    fetch(path, {
        body: JSON.stringify(config.body()),
        method: config.method(),
        headers: compiledHeaders
    })
        .then(async (r: Response) => {
            try {
                const v = await r.text();

                for (const p of PostProcessors)
                    try {
                        await Promise.resolve(p(v, config));
                    } catch {}
                
                // No body
                if (v.length == 0) {
                    if(r.ok) {
                        config.onSuccess()?.({} as T);
                        if(config.cacheResponse() != null && !DisableCache) Cache.cache(config, {});
                    } else {
                        const error = Array.from(ThermalErrorType.values()).find(e => e.code === r.status)?.type ?? "UNKNOWN_ERROR";
                        handleErrorCallbacks(config, error);
                    }
                } else {
                    // Has body
                    const json: ThermalResponse<T> = JSON.parse(v);

                    if(!validateResponse(json)) return handleErrorCallbacks(config, "BAD_FORMAT_ERROR");

                    if(json.status === "success") {
                        await Promise.resolve(config.onSuccess()?.(json.data as T));
                        if(config.cacheResponse() != null && !DisableCache) Cache.cache(config, json.data);
                    } else {
                        const error = Array.from(ThermalErrorType.values()).find(e => e.code === json?.error?.code)?.type ?? "UNKNOWN_ERROR";
                        handleErrorCallbacks(config, error, json.error?.message);
                    }
                }
            } catch(e) {
                try {
                    handleErrorCallbacks(config, "UNKNOWN_ERROR", (e as any).message);
                } catch {
                    handleErrorCallbacks(config, "UNKNOWN_ERROR");
                }
            }
        })
        .catch((e: Error)=>{
            let errorCode: ErrorType | undefined = undefined;
            if (e.name === "TypeError" && e.message === "Failed to fetch") errorCode = "NETWORK_ERROR";
            else if (e.name === "AbortError") errorCode = "ABORT_ERROR";
            else if (e.name === "TypeError" && e.message.includes("CORS")) errorCode = "CORS_ISSUE";
            else if (e.name === "TypeError" && e.message === "NetworkError when attempting to fetch resource.") errorCode = "INVALID_URL_ERROR";
            else if (e.message.includes("timeout")) errorCode = "TIMEOUT_ERROR";
            handleErrorCallbacks(config, errorCode ?? "UNKNOWN_ERROR", e.message);
        })
        .finally(()=>config.onFinal()?.())
}

export type RequestConfigurator = <T>(config: Config<T>) => void;
class Config<R> {
    private _url: string | URL = "";
    private _method: Method = "GET";
    private _body?: any = undefined;
    private _headers = new Map<string, string>();
    private _eagerResponse: R | null = null;
    private _cacheResponse: (TimeDelay & { onExpire?: OnExpired }) | null = null;
    private _onSuccess: ((data: R)=>void) | null = DefaultSuccessHandler;
    private _onError: Map<ErrorType, ErrorHandler> = new Map(DefaultErrorHandlers);
    private _onAnyError: ErrorHandler | null = DefaultAnyErrorHandler;
    private _onAnyOtherErrors: ErrorHandler = DefaultAnyOtherErrorHandler;
    private _onFinal: (()=>void) | null = null;
    private _metadata = new Map<string, any>();
    private _queries = new Map<string, string>();

    public url (url?: string | URL) {
        if(url != undefined) this._url = url;
        return this._url;
    }
    public method (method?: Method) {
        if(method != undefined) this._method = method;
        return this._method;
    }
    public body (body?: any) {
        if(body != undefined) this._body = body;
        return this._body;
    }
    public header (key?: string, value?: string) {
        if(key == undefined || value == undefined) return this._headers;
        this._headers.set(key, value);
        return this._headers;
    }
    public metadata (key?: string, value?: any) {
        if(key == undefined || value == undefined) return this._metadata;
        this._metadata.set(key, value);
        return this._metadata;
    }
    public eagerResponse (value?: R | null) {
        if(value != undefined) this._eagerResponse = value;
        return this._eagerResponse;
    }
    public query (key?: string, value?: string | number | boolean) {
        if(key == undefined || value == undefined) return this._queries;

        this._queries.set(key, `${value}`);
        return this._queries;
    }
    public cacheResponse (amount?: number, unit?: TimeUnit, onExpire?: OnExpired) {
        if(amount == undefined || unit == undefined) return this._cacheResponse;

        this._cacheResponse = { amount, unit, onExpire };
        return this._cacheResponse;
    }
    public onSuccess (handler?: (data: R)=>void | null) {
        if(handler != undefined) this._onSuccess = handler;
        return this._onSuccess;
    }
    public onError (target?: ErrorType, handler?: (error: ThermalError)=>void) {
        if(target == undefined || handler == undefined) return this._onError;
        this._onError.set(target, handler);
        return this._onError;
    }
    public onAnyError (handler?: (error: ThermalError)=>void | null) {
        if(handler != undefined) this._onAnyError = handler;
        return this._onAnyError;
    }
    public onAnyOtherErrors (handler?: (error: ThermalError)=>void) {
        if(handler != undefined) this._onAnyOtherErrors = handler;
        return this._onAnyOtherErrors;
    }
    public onFinal (handler?: ()=>void | null) {
        if(handler != undefined) this._onFinal = handler;
        return this._onFinal;
    }


    public static New = <T>(...configurators: RequestConfigurator[]): Config<T> => {
        const config = new Config<T>();

        for (const c of configurators) {
            try {
                c(config);
            } catch {}
        }

        return config;
    }
}

/**
 * Provides the URL as the target for this request.
 * This url will have the base url appended directly to the beginning of it before executing.
 * @param url The url to make the http request to.
 */
export const withURL = (url: string | URL): RequestConfigurator => (
    (config: Config<any>) => config.url(url)
);

/**
 * Provides the method to use for this request.
 * @param method The method to use.
 */
export const withMethod = (method: Method): RequestConfigurator => (
    (config: Config<any>) => config.method(method)
);

/**
 * Provides the method to use for this request: GET
 */
export const withGET = (): RequestConfigurator => withMethod("GET");

/**
 * Provides the method to use for this request: POST
 */
export const withPOST = (): RequestConfigurator => withMethod("POST");

/**
 * Provides the method to use for this request: PUT
 */
export const withPUT = (): RequestConfigurator => withMethod("PUT");

/**
 * Provides the method to use for this request: PATCH
 */
export const withPATCH = (): RequestConfigurator => withMethod("PATCH");

/**
 * Provides the method to use for this request: DELETE
 */
export const withDELETE = (): RequestConfigurator => withMethod("DELETE");

/**
 * Provides the body to use for this request.
 * @param body The body to send.
 */
export const withBody = (body: any): RequestConfigurator => (
    (config: Config<any>) => config.body(body)
);

/**
 * Provides a header to use for this request.
 * You can use this method multiple times to provide multiple headers.
 * @param header The header to assign a value to.
 * @param value The value to provide for the header.
 */
export const withHeader = (header: string, value: string): RequestConfigurator => (
    (config: Config<any>) => config.header(header, value)
);

/**
 * Provides a metadata to use for this request.
 * You can use this method multiple times to provide multiple metadata mappings.
 * Metadata does not effect the actual HTTP request at all.
 * It simply exists for the caller to read later if they so desire.
 * @param key The key to assign a value to.
 * @param value The value to provide for the metadata.
 */
export const withMetadata = (key: string, value: any): RequestConfigurator => (
    (config: Config<any>) => config.metadata(key, value)
);

/**
 * Provides an Authorization bearer token to use for this request.
 * This method assigns `Bearer ${value}` to the header `Authorization`.
 * @param value The value to attach as the bearer token.
 */
export const withBearerToken = (value: string): RequestConfigurator => (
    (config: Config<any>) => config.header("Authorization", `Bearer ${value}`)
);

/**
 * Provides the handler to use when the request succeeds.
 * @param handler The handler to use.
 */
export const withSuccess = <T>(handler: (data: T)=>void): RequestConfigurator => (
    (config: Config<any>) => config.onSuccess(handler)
);

/**
 * Provides a handler to use when a specific error is generated.
 * If you'd like to assign a handler for any and all errors, you can use {@link withAnyError}.
 * @param target The {@link ErrorType} to be handled.
 * @param handler The handler to use for the specific error.
 */
export const withError = (target: ErrorType, handler: (error: ThermalError)=>void): RequestConfigurator => (
    (config: Config<any>) => config.onError(target, handler)
);

/**
 * Provides a handler to be executed for any and all errors caused by the request.
 * If you'd like to target a specific error, you can use {@link withError}.<br/><br/>
 * This handler will always execute no matter what even if the error was already handled by a {@link withError} handler.
 * If you'd like to only handle errors which did NOT have a {@link withError} handler, use {@link withAnyOtherErrors}.
 * @param handler The handler to use for any and all errors.
 */
export const withAnyErrors = (handler: (error: ThermalError)=>void): RequestConfigurator => (
    (config: Config<any>) => config.onAnyError(handler)
);

/**
 * Provides a handler to be executed for any and all errors caused by the request which weren't already handled by either {@link withError} or {@link withAnyErrors}.
 * More specifically, if a {@link withError} handler already handled the error, this handler will be ignored.
 * Accordingly, if you'd defined a {@link withAnyErrors} handler, then using this method is useless since any errors will always be handled.
 * @param handler The handler to use for any leftover errors.
 */
export const withAnyOtherErrors = (handler: (error: ThermalError)=>void): RequestConfigurator => (
    (config: Config<any>) => config.onAnyOtherErrors(handler)
);

/**
 * Provides a handler to be executed for any and all requests regardless of if they succeed or fail.
 * This handler will run after the success/error handler(s) run.
 * @param handler The handler to use for any requests.
 */
export const withFinal = (handler: ()=>void): RequestConfigurator => (
    (config: Config<any>) => config.onFinal(handler)
);

/**
 * Provides a query parameter on the end of the URL request.
 * @param key The name of the query parameter.
 * @param value The value of the query parameter.
 */
export const withQuery = (key: string, value: string | number | boolean): RequestConfigurator => (
    (config: Config<any>) => config.query(key, value)
);

/**
 * Provides a dummy response that will be returned to the {@link withSuccess} handler immediately.<br/>
 * It is then up to you to properly handle the actual response of the request when it resolves.<br/><br/>
 * If the request resolves successfully, the {@link withSuccess} handler will execute a second time but with the actual response.
 * If the request resolves exceptionally, it will be handled by one of the provided error handlers.
 * @param eagerResponse The object to return eagerly.
 */
export const withEager = <T>(eagerResponse: T): RequestConfigurator => (
    (config: Config<any>) => config.eagerResponse(eagerResponse)
);

/**
 * Provides a cache for the response that will be returned to the {@link withSuccess} handler.
 * The cache stores responses based on factors such as url, request method, request body, and request headers.
 * The cache specifically only stores in-memory. If you'd like to leverage more persistent storage you'll need to so that yourself.
 * @param amount Amount of units that the cached result will be stored for.
 * @param unit The time unit to use.
 * @param onExpire The callback to run once a cached item expires and is removed from the cache.
 */
export const withCache = <T>(amount: number, unit: TimeUnit, onExpire?: OnExpired): RequestConfigurator => (
    (config: Config<any>) => config.cacheResponse(amount, unit, onExpire)
);

const configuratorFetchAdapter = (
    url: string | URL,
    ...configurators: RequestConfigurator[]
) => {
    const config = Config.New(
        ...configurators,
        withURL(url)
    );
    thermalFetch(config)
};
const GET = (
    url: string | URL,
    ...configurators: RequestConfigurator[]
) => configuratorFetchAdapter(
    url,
    ...configurators,
    withMethod("GET")
);
const POST = (
    url: string | URL,
    body: any,
    ...configurators: RequestConfigurator[]
) => configuratorFetchAdapter(
    url,
    ...configurators,
    withBody(body),
    withMethod("POST")
);
const PATCH = (
    url: string | URL,
    body: any,
    ...configurators: RequestConfigurator[]
) => configuratorFetchAdapter(
    url,
    ...configurators,
    withBody(body),
    withMethod("PATCH")
);
const PUT = (
    url: string | URL,
    body: any,
    ...configurators: RequestConfigurator[]
) => configuratorFetchAdapter(
    url,
    ...configurators,
    withBody(body),
    withMethod("PUT")
);
const DELETE = (
    url: string | URL,
    body: any,
    ...configurators: RequestConfigurator[]
) => configuratorFetchAdapter(
    url,
    ...configurators,
    withBody(body),
    withMethod("DELETE")
);

export type Thermal = {
    Error: ThermalError,
    Response: ThermalResponse<any>,
    Status: ErrorType,
}
export const Thermal = {
    Status: ThermalErrorType,
    resolveError,
    fetch: thermalFetch,
    GET,
    POST,
    PUT,
    PATCH,
    DELETE,
    configure: {
        addPreProcessor: (handler: PreProcessor) => PreProcessors.push(handler),
        addPostProcessor: (handler: PostProcessor) => PostProcessors.push(handler),
        getBaseURL: () => BaseUrl,
        setBaseURL: (base: string) => BaseUrl = base,
        setDefaultSuccessHandler: <T>(handler: ((data: T)=>void) | null) => DefaultSuccessHandler = handler,
        setDefaultAnyErrorHandler: (handler: ErrorHandler | null) => DefaultAnyErrorHandler = handler,
        setDefaultAnyOtherErrorsHandler: (handler: ErrorHandler) => DefaultAnyOtherErrorHandler = handler,
        setDefaultErrorHandler: (type: ErrorType, handler: ErrorHandler) => DefaultErrorHandlers.set(type, handler),
        deleteDefaultErrorHandler: (type: ErrorType) => DefaultErrorHandlers.delete(type),
        clearDefaultErrorHandlers: () => DefaultErrorHandlers.clear(),
        clearCache: ()=>Cache.clear(),
        disableCache: ()=>DisableCache = true,
        enableCache: ()=>DisableCache = false,
    }
}
