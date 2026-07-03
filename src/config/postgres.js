import { assertAllowlistedIdentifier } from '../utils/sqlIdentifiers.js';
import { EXPECTED_SCHEMA_LABEL, EXPECTED_SCHEMA_VERSION } from './schemaVersion.js';

// ── Connection URL resolution ────────────────────────────────────────────────
// DATABASE_PUBLIC_URL  — Railway public proxy, reachable from anywhere (Replit, local dev, etc.)
// DATABASE_URL         — may be internal or public depending on Railway project settings
// POSTGRES_URL         — Railway internal private network URL (only reachable inside Railway)
//
// Prefer the public URL so the bot works from Replit and Railway alike.
// On Railway in production, all three will be set; the public URL still works fine there.
const CONNECTION_URL =
    process.env.DATABASE_PUBLIC_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    null;

// Parse the URL into individual options so the rest of the codebase can use
// either approach.  Falls back gracefully if no URL is provided.
let _parsedUrl = {};
if (CONNECTION_URL) {
    try {
        const u = new URL(CONNECTION_URL);
        _parsedUrl = {
            host:     u.hostname,
            port:     parseInt(u.port, 10) || 5432,
            database: u.pathname.replace(/^\//, ''),
            user:     u.username,
            password: decodeURIComponent(u.password),
            // Railway (and most hosted Postgres) require SSL; disable cert
            // verification because Railway uses self-signed certs.
            ssl: { rejectUnauthorized: false },
        };
    } catch (_) {
        // malformed URL — will fall through to individual env-var defaults
    }
}

const configuredTables = {
    guilds: 'guilds',
    users: 'users',
    guild_users: 'guild_users',
    birthdays: 'birthdays',
    giveaways: 'giveaways',
    tickets: 'ticket_data',
    afk_status: 'afk_status',
    welcome_configs: 'welcome_configs',
    leveling_configs: 'leveling_configs',
    user_levels: 'user_levels',
    invite_tracking: 'invite_tracking',
    application_roles: 'application_roles',
    verification_audit: 'verification_audit',
    temp_data: 'temp_data',
    cache_data: 'cache_data',
};

const allowedTableIdentifiers = new Set([
    'guilds',
    'users',
    'guild_users',
    'birthdays',
    'giveaways',
    'ticket_data',
    'afk_status',
    'welcome_configs',
    'leveling_configs',
    'user_levels',
    'invite_tracking',
    'application_roles',
    'verification_audit',
    'temp_data',
    'cache_data',
]);

const validatedTables = Object.fromEntries(
    Object.entries(configuredTables).map(([key, value]) => [
        key,
        assertAllowlistedIdentifier(value, allowedTableIdentifiers, `PostgreSQL table identifier (${key})`),
    ])
);



export const pgConfig = {
    url: CONNECTION_URL || 'postgresql://localhost:5432/titanbot',
    // When set, postgresDatabase.js will pass this directly to pg.Pool
    // instead of individual host/port/... options.
    connectionString: CONNECTION_URL || null,
    
    options: {
        
        host:     _parsedUrl.host     || process.env.POSTGRES_HOST || 'localhost',
        port:     _parsedUrl.port     || parseInt(process.env.POSTGRES_PORT) || 5432,
        database: _parsedUrl.database || process.env.POSTGRES_DB   || 'titanbot',
        user:     _parsedUrl.user     || process.env.POSTGRES_USER  || 'postgres',
        password: _parsedUrl.password || (process.env.POSTGRES_PASSWORD || '').toString(),
        ssl: _parsedUrl.ssl || (process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false' } : false),
        
        
        max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS) || 20,
        min: parseInt(process.env.POSTGRES_MIN_CONNECTIONS) || 2,
        idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT) || 30000,
        connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT) || 10000,
        
        
        application_name: 'titanbot',
        statement_timeout: process.env.NODE_ENV === 'production' ? 30000 : 0,
        keepalives: 1,
        keepalives_idle: 30,
        
        
        retries: parseInt(process.env.POSTGRES_RETRIES) || 3,
        backoffBase: parseInt(process.env.POSTGRES_BACKOFF_BASE) || 100,
        backoffMultiplier: parseInt(process.env.POSTGRES_BACKOFF_MULTIPLIER) || 2,
    },
    
    tables: validatedTables,
    
    defaultTTL: {
        userSession: 86400,
        
        temp: 3600,
        
        cache: 1800,
        
        guildConfig: null,
        
        leveling: null,
        
        giveaway: null,
        
        ticket: 604800,
        
        afk: 86400,
        
        welcome: null,
        
        birthday: null,
    },
    
    features: {
        pooling: true,
        ssl: process.env.POSTGRES_SSL === 'true',
        
        metrics: true,
        
        debug: process.env.NODE_ENV === 'development',
        
        autoCreateTables: true,
        
        autoMigrate: process.env.AUTO_MIGRATE !== 'false',
    },
    
    healthCheck: {
        enabled: true,
        
        interval: 30000,
        
        maxFailures: 3,
        
        query: 'SELECT 1',
    },
    
    migration: {
        enabled: true,
        
        table: 'schema_migrations',
        
        directory: 'database/migrations',
        
        rollbackOnFailure: false,

        expectedVersion: EXPECTED_SCHEMA_VERSION,

        expectedLabel: EXPECTED_SCHEMA_LABEL,
    }
};

export default pgConfig;


