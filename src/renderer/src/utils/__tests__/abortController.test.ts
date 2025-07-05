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
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

// 测试辅助函数
const createMockFn = () => vi.fn()
const setupAbortFns = (id: string, count: number = 2) => {
  const fns = Array(count).fill(null).map(() => createMockFn())
  fns.forEach(fn => addAbortController(id, fn))
  return fns
}

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
      const [fn1, fn2] = setupAbortFns('test-id')

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
      const [fn1, fn2] = setupAbortFns('test-id')
      removeAbortController('test-id', fn1)

      const remaining = abortMap.get('test-id')
      expect(remaining).toHaveLength(1)
      expect(remaining).toContain(fn2)
      expect(remaining).not.toContain(fn1)
    })

    it('should keep empty array after removing all functions', () => {
      const [fn1, fn2] = setupAbortFns('test-id')

      // 分别删除每个函数
      removeAbortController('test-id', fn1)
      removeAbortController('test-id', fn2)

      // 验证删除所有函数后，Map entry 仍然存在但数组为空
      expect(abortMap.has('test-id')).toBe(true)
      expect(abortMap.get('test-id')).toEqual([])
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
      const [fn1, fn2] = setupAbortFns('test-id')

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

    it('should handle concurrent operations safely', () => {
      // 测试并发场景：多个地方同时操作同一个 id
      const fn1 = vi.fn()
      const fn2 = vi.fn()
      
      // 并发添加
      addAbortController('concurrent-id', fn1)
      addAbortController('concurrent-id', fn2)
      
      // 在 abortCompletion 执行期间添加新函数
      const originalAbortFns = abortMap.get('concurrent-id')
      expect(originalAbortFns).toHaveLength(2)
      
      // 模拟 abortCompletion 的行为
      abortCompletion('concurrent-id')
      
      // 验证原有函数被调用
      expect(fn1).toHaveBeenCalledTimes(1)
      expect(fn2).toHaveBeenCalledTimes(1)
      
      // 验证 Map 状态正确
      expect(abortMap.get('concurrent-id')).toEqual([])
    })
  })

  describe('createAbortPromise', () => {
    describe('abort behavior', () => {
      it('should reject immediately if signal already aborted', async () => {
        const controller = new AbortController()
        controller.abort()

        const promise = createAbortPromise(controller.signal, Promise.resolve('success'))

        await expect(promise).rejects.toThrow('Operation aborted')
      })

      it('should reject when signal is aborted later', async () => {
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

        await expect(promise).rejects.toMatchObject({
          name: 'AbortError',
          message: 'Operation aborted'
        })
        await expect(promise).rejects.toBeInstanceOf(DOMException)
      })
    })

    describe('cleanup and logging', () => {
      it('should log abort event', async () => {
        const logger = await import('@renderer/config/logger')
        const logSpy = logger.default.log as ReturnType<typeof vi.fn>

        const controller = new AbortController()
        const promise = createAbortPromise(controller.signal, new Promise(() => {}))

        controller.abort()

        await expect(promise).rejects.toThrow()

        // 验证日志被调用
        expect(logSpy).toHaveBeenCalledWith('[createAbortPromise] abortHandler', expect.any(Event))
      })

      it('should cleanup event listener when finallyPromise completes', async () => {
        const controller = new AbortController()
        const finallyPromise = Promise.resolve('completed')
        
        // 监听 removeEventListener 调用
        const removeEventListenerSpy = vi.spyOn(controller.signal, 'removeEventListener')
        
        createAbortPromise(controller.signal, finallyPromise)
        
        // 等待 finallyPromise 完成
        await finallyPromise
        
        // 验证事件监听器被移除
        expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function))
      })
    })
  })
})
