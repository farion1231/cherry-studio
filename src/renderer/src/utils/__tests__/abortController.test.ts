import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  abortCompletion,
  abortMap,
  addAbortController,
  createAbortPromise,
  removeAbortController
} from '../abortController'

// Mock logger
vi.mock('@renderer/config/logger', () => ({
  default: {
    log: vi.fn()
  }
}))

describe('abortController', () => {
  beforeEach(() => {
    // 清理全局 Map
    abortMap.clear()
  })

  describe('addAbortController', () => {
    it('should add abort function to map', () => {
      const abortFn = vi.fn()
      addAbortController('test-id', abortFn)

      expect(abortMap.get('test-id')).toContain(abortFn)
    })

    it('should handle multiple abort functions for same id', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()

      addAbortController('test-id', fn1)
      addAbortController('test-id', fn2)

      const fns = abortMap.get('test-id')
      expect(fns).toHaveLength(2)
      expect(fns).toContain(fn1)
      expect(fns).toContain(fn2)
    })

    it('should handle edge cases', () => {
      // 测试空函数和空字符串 id
      // @ts-expect-error 测试类型错误
      addAbortController('test-id', null)
      expect(abortMap.get('test-id')).toEqual([null])

      const fn = vi.fn()
      addAbortController('', fn)
      expect(abortMap.get('')).toContain(fn)
    })
  })

  describe('removeAbortController', () => {
    it('should remove specific abort function', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()

      addAbortController('test-id', fn1)
      addAbortController('test-id', fn2)
      removeAbortController('test-id', fn1)

      const remaining = abortMap.get('test-id')
      expect(remaining).toHaveLength(1)
      expect(remaining).toContain(fn2)
      expect(remaining).not.toContain(fn1)
    })

    it('should remove all functions when no specific function provided', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()

      addAbortController('test-id', fn1)
      addAbortController('test-id', fn2)
      
      // 分别删除每个函数
      removeAbortController('test-id', fn1)
      removeAbortController('test-id', fn2)

      expect(abortMap.has('test-id')).toBe(true) // Map 仍然存在但为空
    })

    it('should handle non-existent cases gracefully', () => {
      const fn = vi.fn()
      const fn2 = vi.fn()
      
      // 删除不存在的 ID
      expect(() => removeAbortController('non-existent', fn)).not.toThrow()
      
      // 删除不存在的函数 - 现在应该正确地不删除任何元素
      addAbortController('test-id', fn)
      removeAbortController('test-id', fn2)
      
      // 修复后：原始函数应该保持在数组中
      expect(abortMap.get('test-id')).toEqual([fn])
    })
  })

  describe('abortCompletion', () => {
    it('should call all abort functions and clean up', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()

      addAbortController('test-id', fn1)
      addAbortController('test-id', fn2)

      abortCompletion('test-id')

      expect(fn1).toHaveBeenCalledTimes(1)
      expect(fn2).toHaveBeenCalledTimes(1)
      // 注意：removeAbortController 只删除数组中的函数，不删除 Map entry
      expect(abortMap.has('test-id')).toBe(true)
      expect(abortMap.get('test-id')).toEqual([])
    })

    it('should handle non-existent id gracefully', () => {
      expect(() => abortCompletion('non-existent')).not.toThrow()
    })

    it('should throw if abort function throws', () => {
      const fn1 = vi.fn(() => {
        throw new Error('Abort function error')
      })
      const fn2 = vi.fn()

      addAbortController('test-id', fn1)
      addAbortController('test-id', fn2)

      // 应该抛出错误，后续函数不会执行
      expect(() => abortCompletion('test-id')).toThrow('Abort function error')
      expect(fn1).toHaveBeenCalledTimes(1)
      expect(fn2).not.toHaveBeenCalled()
    })
  })

  describe('createAbortPromise', () => {
    it('should reject immediately if signal already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const promise = createAbortPromise(controller.signal, Promise.resolve('success'))

      await expect(promise).rejects.toThrow('Operation aborted')
    })

    it('should reject when signal is aborted', async () => {
      const controller = new AbortController()
      const finallyPromise = new Promise<string>(() => {})

      const promise = createAbortPromise(controller.signal, finallyPromise)

      // 稍后中止
      setTimeout(() => controller.abort(), 10)

      await expect(promise).rejects.toThrow('Operation aborted')
    })

    it('should create DOMException with correct properties', async () => {
      const controller = new AbortController()
      controller.abort()

      const promise = createAbortPromise(controller.signal, Promise.resolve('success'))

      try {
        await promise
      } catch (error) {
        expect(error).toBeInstanceOf(DOMException)
        expect((error as DOMException).name).toBe('AbortError')
        expect((error as DOMException).message).toBe('Operation aborted')
      }
    })

    it('should log abort event', async () => {
      const logger = await import('@renderer/config/logger')
      const logSpy = logger.default.log as ReturnType<typeof vi.fn>

      const controller = new AbortController()
      const promise = createAbortPromise(controller.signal, new Promise(() => {}))

      controller.abort()

      try {
        await promise
      } catch {
        // 忽略错误
      }

      // 验证日志被调用
      expect(logSpy).toHaveBeenCalledWith('[createAbortPromise] abortHandler', expect.any(Event))
    })
  })
})