import { describe, expect, it, vi } from 'vitest'

import { AsyncInitializer } from '../asyncInitializer'

describe('AsyncInitializer', () => {
  it('should initialize value lazily on first get', async () => {
    const mockFactory = vi.fn().mockResolvedValue('test-value')
    const initializer = new AsyncInitializer(mockFactory)

    // factory 不应该在构造时调用
    expect(mockFactory).not.toHaveBeenCalled()

    // 第一次调用 get
    const result = await initializer.get()

    expect(mockFactory).toHaveBeenCalledTimes(1)
    expect(result).toBe('test-value')
  })

  it('should cache value and return same instance on subsequent calls', async () => {
    const mockFactory = vi.fn().mockResolvedValue('test-value')
    const initializer = new AsyncInitializer(mockFactory)

    // 多次调用 get
    const result1 = await initializer.get()
    const result2 = await initializer.get()
    const result3 = await initializer.get()

    // factory 只应该被调用一次
    expect(mockFactory).toHaveBeenCalledTimes(1)

    // 所有结果应该相同
    expect(result1).toBe('test-value')
    expect(result2).toBe('test-value')
    expect(result3).toBe('test-value')
  })

  it('should handle concurrent calls properly', async () => {
    let resolveFactory: (value: string) => void
    const factoryPromise = new Promise<string>((resolve) => {
      resolveFactory = resolve
    })
    const mockFactory = vi.fn().mockReturnValue(factoryPromise)

    const initializer = new AsyncInitializer(mockFactory)

    // 同时调用多次 get
    const promise1 = initializer.get()
    const promise2 = initializer.get()
    const promise3 = initializer.get()

    // factory 只应该被调用一次
    expect(mockFactory).toHaveBeenCalledTimes(1)

    // 解析 promise
    resolveFactory!('concurrent-value')

    const results = await Promise.all([promise1, promise2, promise3])
    expect(results).toEqual(['concurrent-value', 'concurrent-value', 'concurrent-value'])
  })

  it('should handle and cache errors', async () => {
    const error = new Error('Factory error')
    const mockFactory = vi.fn().mockRejectedValue(error)
    const initializer = new AsyncInitializer(mockFactory)

    // 多次调用都应该返回相同的错误
    await expect(initializer.get()).rejects.toThrow('Factory error')
    await expect(initializer.get()).rejects.toThrow('Factory error')

    // factory 只应该被调用一次
    expect(mockFactory).toHaveBeenCalledTimes(1)
  })

  describe('type support', () => {
    it.each([
      ['number', 42],
      ['object', { name: 'test', value: 123 }],
      ['array', [1, 2, 3]],
      ['null', null],
      ['undefined', undefined]
    ])('should work with %s type', async (_, value) => {
      const initializer = new AsyncInitializer(() => Promise.resolve(value))
      expect(await initializer.get()).toBe(value)
    })
  })

  it('should maintain separate instances', async () => {
    const factory1 = vi.fn().mockResolvedValue('value1')
    const factory2 = vi.fn().mockResolvedValue('value2')

    const initializer1 = new AsyncInitializer(factory1)
    const initializer2 = new AsyncInitializer(factory2)

    const result1 = await initializer1.get()
    const result2 = await initializer2.get()

    // 每个实例应该有自己的值
    expect(result1).toBe('value1')
    expect(result2).toBe('value2')

    // 每个 factory 都应该被调用
    expect(factory1).toHaveBeenCalledTimes(1)
    expect(factory2).toHaveBeenCalledTimes(1)
  })

  it('should not retry after failure', async () => {
    // 确认错误被缓存，不会重试
    const error = new Error('Initialization failed')
    const mockFactory = vi.fn().mockRejectedValue(error)
    const initializer = new AsyncInitializer(mockFactory)

    // 第一次失败
    await expect(initializer.get()).rejects.toThrow('Initialization failed')

    // 第二次调用不应该重试
    await expect(initializer.get()).rejects.toThrow('Initialization failed')

    // factory 只被调用一次
    expect(mockFactory).toHaveBeenCalledTimes(1)
  })
})
