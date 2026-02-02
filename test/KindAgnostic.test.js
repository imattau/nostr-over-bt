import { jest, describe, test, expect } from '@jest/globals';
import { EventPackager } from '../src/core/EventPackager.js';

describe('Kind Agnostic Verification', () => {
    const packager = new EventPackager();

    const testKinds = [
        { kind: 0, name: 'Metadata' },
        { kind: 1, name: 'Text Note' },
        { kind: 4, name: 'Direct Message' },
        { kind: 30023, name: 'Long-form Content' },
        { kind: 9999, name: 'Custom App Kind' }
    ];

    testKinds.forEach(({ kind, name }) => {
        test(`should correctly package and unpack Kind ${kind} (${name})`, () => {
            const event = {
                id: `id-kind-${kind}`,
                pubkey: 'pubkey',
                created_at: 123456,
                kind: kind,
                tags: [],
                content: `Content for kind ${kind}`,
                sig: 'sig'
            };

            const buffer = packager.package(event);
            const unpacked = packager.unpack(buffer);

            expect(unpacked.kind).toBe(kind);
            expect(unpacked.content).toBe(event.content);
        });
    });
});
