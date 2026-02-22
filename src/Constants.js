import * as nostr from 'nostr-tools';

/**
 * Event Kinds standardized via nostr-tools where possible.
 */
export const Kinds = {
    Metadata: nostr.kinds?.Metadata ?? 0,
    TextNote: nostr.kinds?.ShortTextNote ?? 1,
    Contacts: nostr.kinds?.Contacts ?? 3,
    Application: nostr.kinds?.Application ?? 30078,
    LongForm: nostr.kinds?.LongFormArticle ?? 30023
};

/**
 * Protocol-specific identifiers for P2P discovery.
 */
export const Identifiers = {
    IDENTITY_BRIDGE: 'nostr-over-bt-identity',
    FEED_BRIDGE: 'nostr-over-bt-feed'
};

/**
 * Cache and performance limits.
 */
export const Limits = {
    KEY_CACHE_SIZE: 5000,
    MAGNET_CACHE_SIZE: 5000,
    PROFILE_CACHE_SIZE: 1000,
    FEED_INDEX_LIMIT: 100,
    BATCH_INTERVAL_MS: 2000,
    MAX_BATCH_SIZE: 50
};
