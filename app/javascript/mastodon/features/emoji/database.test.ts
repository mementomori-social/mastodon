import type { CompactEmoji } from 'emojibase';
import { IDBFactory } from 'fake-indexeddb';

import { customEmojiFactory, unicodeEmojiFactory } from '@/testing/factories';

import {
  putEmojiData,
  search,
  loadEmojiByHexcode,
  testClear,
  testGet,
  putCustomEmojiData,
  putLegacyShortcodes,
  loadLegacyShortcodesByShortcode,
} from './database';

function rawEmojiFactory(data: Partial<CompactEmoji> = {}): CompactEmoji {
  return {
    ...unicodeEmojiFactory(),
    tags: ['test', 'emoji'],
    ...data,
  };
}

describe('emoji database', () => {
  beforeEach(async () => {
    await testGet(); // Loads the database schema.
  });

  afterEach(() => {
    testClear();
    indexedDB = new IDBFactory();
  });

  describe('search', () => {
    beforeEach(async () => {
      await putEmojiData([], 'en');
    });

    test('test no query tokens', async () => {
      await putEmojiData([rawEmojiFactory()], 'en');
      await expect(search({ query: '   ', locale: 'en' })).resolves.toEqual([]);
    });

    test('unicode results', async () => {
      await putEmojiData(
        [
          rawEmojiFactory({
            hexcode: 'unicode_hex',
            label: 'Party Popper',
            shortcodes: ['party_popper'],
            unicode: '🎉',
          }),
        ],
        'en',
      );

      await expect(
        search({ query: 'party', locale: 'en' }),
      ).resolves.toContainEqual(
        expect.objectContaining({
          hexcode: 'unicode_hex',
        }),
      );
    });

    test('custom results', async () => {
      await putCustomEmojiData({
        emojis: [customEmojiFactory({ shortcode: 'party_custom' })],
      });

      await expect(
        search({ query: 'party', locale: 'en' }),
      ).resolves.toContainEqual(
        expect.objectContaining({
          shortcode: 'party_custom',
        }),
      );
    });

    test('shortcode results', async () => {
      await putEmojiData([rawEmojiFactory()], 'en');
      await putLegacyShortcodes({
        test: ['legacy_smile'],
      });

      await expect(
        search({ query: 'legacy', locale: 'en' }),
      ).resolves.toContainEqual(
        expect.objectContaining({
          hexcode: 'test',
        }),
      );
    });

    test('full custom emoji search', async () => {
      await putCustomEmojiData({
        emojis: [
          customEmojiFactory({ shortcode: 'arrow' }),
          customEmojiFactory({ shortcode: 'party_parrot' }),
        ],
      });

      const result = await search({ query: 'arro', locale: 'en' });
      expect(result).toContainEqual(
        // Test for ordinary IDB search
        expect.objectContaining({
          shortcode: 'arrow',
        }),
      );
      expect(result).toContainEqual(
        // Test for manual iteration search
        expect.objectContaining({
          shortcode: 'party_parrot',
        }),
      );
    });

    test('ranks name word-matches (native first) above tag-only matches', async () => {
      await putEmojiData(
        [
          // "sweat" is a whole word in the name.
          rawEmojiFactory({
            hexcode: '1F605',
            label: 'grinning face with sweat',
            shortcodes: ['grinning_face_with_sweat'],
            unicode: '😅',
            tags: [],
          }),
          // "sweat" only appears as a keyword/tag, not in the name.
          rawEmojiFactory({
            hexcode: '1F625',
            label: 'sad but relieved face',
            shortcodes: ['sad_but_relieved_face'],
            unicode: '😥',
            tags: ['sweat'],
          }),
        ],
        'en',
      );
      await putCustomEmojiData({
        emojis: [customEmojiFactory({ shortcode: 'blob_sweat' })],
      });

      const results = await search({ query: 'sweat', locale: 'en' });
      const ids = results.map((emoji) =>
        'shortcode' in emoji ? emoji.shortcode : emoji.hexcode,
      );

      // The native emoji with the word in its name ranks first.
      expect(ids[0]).toBe('1F605');
      // The word-matching custom emoji is present...
      expect(ids).toContain('blob_sweat');
      // ...and both name/word matches rank ahead of the tag-only native, which
      // would otherwise crowd them out.
      expect(ids.indexOf('1F605')).toBeLessThan(ids.indexOf('1F625'));
      expect(ids.indexOf('blob_sweat')).toBeLessThan(ids.indexOf('1F625'));
    });

    test('limit test', async () => {
      await putCustomEmojiData({
        emojis: [
          customEmojiFactory({ shortcode: 'limit' }),
          customEmojiFactory({ shortcode: 'limit_extra' }),
        ],
      });

      await expect(
        search({ query: 'limit', locale: 'en', limit: 1 }),
      ).resolves.toEqual([
        expect.objectContaining({
          shortcode: 'limit',
        }),
      ]);
    });
  });

  describe('putEmojiData', () => {
    test('adds to loaded locales', async () => {
      const { loadedLocales } = await testGet();
      expect(loadedLocales).toHaveLength(0);
      await putEmojiData([], 'en');
      expect(loadedLocales).toContain('en');
    });

    test('loads emoji into indexedDB', async () => {
      await putEmojiData([rawEmojiFactory()], 'en');
      const { db } = await testGet();
      await expect(db.get('en', 'test')).resolves.toEqual(
        unicodeEmojiFactory(),
      );
    });
  });

  describe('putCustomEmojiData', () => {
    test('loads custom emoji into indexedDB', async () => {
      const { db } = await testGet();
      await putCustomEmojiData({ emojis: [customEmojiFactory()] });
      await expect(db.get('custom', 'custom')).resolves.toEqual(
        customEmojiFactory(),
      );
    });

    test('clears existing custom emoji if specified', async () => {
      const { db } = await testGet();
      await putCustomEmojiData({
        emojis: [customEmojiFactory({ shortcode: 'emoji1' })],
      });
      await putCustomEmojiData({
        emojis: [customEmojiFactory({ shortcode: 'emoji2' })],
        clear: true,
      });
      await expect(db.get('custom', 'emoji1')).resolves.toBeUndefined();
      await expect(db.get('custom', 'emoji2')).resolves.toEqual(
        customEmojiFactory({ shortcode: 'emoji2', tokens: ['emoji2'] }),
      );
    });
  });

  describe('putLegacyShortcodes', () => {
    test('loads shortcodes into indexedDB', async () => {
      const { db } = await testGet();
      await putLegacyShortcodes({
        test_hexcode: ['shortcode1', 'shortcode2'],
      });
      await expect(db.get('shortcodes', 'test_hexcode')).resolves.toEqual({
        hexcode: 'test_hexcode',
        shortcodes: ['shortcode1', 'shortcode2'],
      });
    });
  });

  describe('loadEmojiByHexcode', () => {
    test('retrieves the emoji', async () => {
      await putEmojiData([unicodeEmojiFactory()], 'en');
      await expect(loadEmojiByHexcode('test', 'en')).resolves.toEqual(
        unicodeEmojiFactory(),
      );
    });

    test('returns undefined if not found', async () => {
      await putEmojiData([], 'en');
      await expect(loadEmojiByHexcode('test', 'en')).resolves.toBeUndefined();
    });
  });

  describe('loadLegacyShortcodesByShortcode', () => {
    const data = {
      hexcode: 'test_hexcode',
      shortcodes: ['shortcode1', 'shortcode2'],
    };

    beforeEach(async () => {
      await putLegacyShortcodes({
        [data.hexcode]: data.shortcodes,
      });
    });

    test('retrieves the shortcodes', async () => {
      await expect(
        loadLegacyShortcodesByShortcode('shortcode1'),
      ).resolves.toEqual(data);
      await expect(
        loadLegacyShortcodesByShortcode('shortcode2'),
      ).resolves.toEqual(data);
    });
  });
});
