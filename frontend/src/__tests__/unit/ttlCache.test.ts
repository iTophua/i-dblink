import { describe, it, expect, beforeEach, vi } from 'vitest';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 100, ttl = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });

    return entry.data;
  }

  set(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

describe('TTLCache', () => {
  let cache: TTLCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new TTLCache<string>(3, 1000);
  });

  describe('get', () => {
    it('returns value within TTL', () => {
      cache.set('key1', 'value1');
      const result = cache.get('key1');
      expect(result).toBe('value1');
    });

    it('returns null for non-existent key', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null after TTL expires', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(1500);
      const result = cache.get('key1');
      expect(result).toBeNull();
    });

    it('resets TTL on access (LRU behavior)', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(500);
      cache.get('key1');
      vi.advanceTimersByTime(600);
      const result = cache.get('key1');
      expect(result).toBe('value1');
    });

    it('removes expired entry from cache', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(1500);
      cache.get('key1');
      expect(cache.size).toBe(0);
    });
  });

  describe('set', () => {
    it('inserts new entry', () => {
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      expect(cache.get('key1')).toBe('value1');
    });

    it('overwrites existing entry', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size).toBe(1);
    });

    it('evicts oldest entry when maxSize reached', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.size).toBe(3);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('respects custom maxSize', () => {
      const smallCache = new TTLCache<string>(2, 1000);
      smallCache.set('a', '1');
      smallCache.set('b', '2');
      smallCache.set('c', '3');
      expect(smallCache.size).toBe(2);
      expect(smallCache.get('a')).toBeNull();
      expect(smallCache.get('b')).toBe('2');
      expect(smallCache.get('c')).toBe('3');
    });
  });

  describe('delete', () => {
    it('removes existing entry', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
      expect(cache.size).toBe(0);
    });

    it('does nothing for non-existent key', () => {
      cache.delete('nonexistent');
      expect(cache.size).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('removes expired entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      vi.advanceTimersByTime(1500);
      cache.cleanup();
      expect(cache.size).toBe(0);
    });

    it('keeps non-expired entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      vi.advanceTimersByTime(500);
      cache.set('key3', 'value3');
      cache.cleanup();
      expect(cache.size).toBe(3);
    });

    it('removes only expired entries', () => {
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(500);
      cache.set('key2', 'value2');
      vi.advanceTimersByTime(1000);
      cache.cleanup();
      expect(cache.size).toBe(1);
      expect(cache.get('key2')).toBe('value2');
    });
  });
});
