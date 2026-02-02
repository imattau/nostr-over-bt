/**
 * WoTManager handles the "Web of Trust" logic.
 * It maintains a list of users that the local user follows,
 * allowing the TransportManager to selectively seed content.
 */
export class WoTManager {
    constructor(nostrTransport) {
        this.nostr = nostrTransport;
        this.follows = new Map(); // pubkey -> { degree, lastSynced }
        this.myPubkey = null;
        this.maxDegree = 2; // Default to follows of follows
    }

    /**
     * Refreshes the follow list for the given user.
     * @param {string} userPubkey - The public key of the local user.
     * @returns {Promise<void>}
     */
    async refreshFollows(userPubkey) {
        this.myPubkey = userPubkey;
        this.follows.set(userPubkey, { degree: 0, lastSynced: Date.now() });
        console.log(`WoTManager: Refreshing primary follows for ${userPubkey}...`);

        return new Promise((resolve) => {
            const filter = { authors: [userPubkey], kinds: [3], limit: 1 };
            const timeout = setTimeout(() => resolve(), 5000);

            this.nostr.subscribe(filter, (event) => {
                if (event.kind === 3) {
                    clearTimeout(timeout);
                    this._parseContactList(event, 1);
                    resolve();
                }
            });
        });
    }

    /**
     * Adds follows from a specific user at a specific degree.
     * @param {object} event - Kind 3 event.
     * @param {number} degree - Depth in the graph.
     */
    _parseContactList(event, degree) {
        if (degree > this.maxDegree) return;

        if (event.tags) {
            for (const tag of event.tags) {
                if (tag[0] === 'p') {
                    const pk = tag[1];
                    // Only add if not already present or if we found a shorter path
                    const existing = this.follows.get(pk);
                    if (!existing || existing.degree > degree) {
                        this.follows.set(pk, { degree, lastSynced: 0 });
                    }
                }
            }
        }
        console.log(`WoTManager: Graph expanded. Total nodes: ${this.follows.size}`);
    }

    /**
     * Checks if a pubkey is within the trusted graph.
     * @param {string} pubkey 
     * @returns {boolean}
     */
    isFollowing(pubkey) {
        return this.follows.has(pubkey);
    }

    /**
     * Manually adds a follow to the graph.
     * @param {string} pubkey 
     * @param {number} [degree=1] 
     */
    addFollow(pubkey, degree = 1) {
        const existing = this.follows.get(pubkey);
        if (!existing || existing.degree > degree) {
            this.follows.set(pubkey, { degree, lastSynced: 0 });
            console.log(`WoTManager: Manually added follow ${pubkey.substring(0,8)} at degree ${degree}`);
        }
    }

    /**
     * Returns all pubkeys at a specific degree.
     * @param {number} degree 
     * @returns {Array<string>}
     */
    getPubkeysAtDegree(degree) {
        return Array.from(this.follows.entries())
            .filter(([_, data]) => data.degree === degree)
            .map(([pk, _]) => pk);
    }
}
