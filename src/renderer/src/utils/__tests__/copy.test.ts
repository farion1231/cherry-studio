import { Message, Topic } from '@renderer/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { copyMessageAsPlainText, copyTopicAsMarkdown, copyTopicAsPlainText } from '../copy'

// Mock dependencies
vi.mock('@renderer/utils/export', () => ({
  topicToMarkdown: vi.fn(),
  topicToPlainText: vi.fn(),
  messageToPlainText: vi.fn()
}))

vi.mock('i18next', () => ({
  default: {
    t: vi.fn((key) => key)
  }
}))

// Mock navigator.clipboard
const mockClipboard = {
  writeText: vi.fn()
}

// Mock window.message
const mockMessage = {
  success: vi.fn()
}

// 创建测试数据辅助函数
function createTestTopic(partial: Partial<Topic> = {}): Topic {
  return {
    id: 'test-topic-id',
    assistantId: 'test-assistant-id',
    name: 'Test Topic',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    ...partial
  }
}

function createTestMessage(partial: Partial<Message> = {}): Message {
  return {
    id: 'test-message-id',
    role: 'user',
    assistantId: 'test-assistant-id',
    topicId: 'test-topic-id',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'success',
    blocks: [],
    ...partial
  } as Message
}

describe('copy', () => {
  beforeEach(() => {
    // 设置全局 mocks
    Object.defineProperty(global.navigator, 'clipboard', {
      value: mockClipboard,
      writable: true
    })

    Object.defineProperty(global.window, 'message', {
      value: mockMessage,
      writable: true
    })

    // 清理所有 mock 调用
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // 共享测试函数 - 用于测试复制功能的基本行为
  async function testCopyFunction(
    copyFn: Function,
    testData: Topic | Message,
    exportFn: string,
    expectedContent: string
  ) {
    const exportModule = await import('@renderer/utils/export')
    const mockExportFn = vi.mocked(exportModule[exportFn])
    
    // 设置成功场景
    if (exportFn === 'messageToPlainText') {
      mockExportFn.mockReturnValue(expectedContent)
    } else {
      mockExportFn.mockResolvedValue(expectedContent)
    }
    mockClipboard.writeText.mockResolvedValue(undefined)

    // 测试成功复制
    await copyFn(testData)
    expect(mockExportFn).toHaveBeenCalledWith(testData)
    expect(mockClipboard.writeText).toHaveBeenCalledWith(expectedContent)
    expect(mockMessage.success).toHaveBeenCalledWith('message.copy.success')

    // 清理 mocks
    vi.clearAllMocks()

    // 测试空内容
    const emptyContent = ''
    if (exportFn === 'messageToPlainText') {
      mockExportFn.mockReturnValue(emptyContent)
    } else {
      mockExportFn.mockResolvedValue(emptyContent)
    }
    
    await copyFn(testData)
    expect(mockClipboard.writeText).toHaveBeenCalledWith(emptyContent)
    expect(mockMessage.success).toHaveBeenCalledWith('message.copy.success')

    // 清理 mocks
    vi.clearAllMocks()

    // 测试 clipboard 错误
    if (exportFn === 'messageToPlainText') {
      mockExportFn.mockReturnValue(expectedContent)
    } else {
      mockExportFn.mockResolvedValue(expectedContent)
    }
    mockClipboard.writeText.mockRejectedValue(new Error('Clipboard error'))

    await expect(copyFn(testData)).rejects.toThrow('Clipboard error')
    expect(mockMessage.success).not.toHaveBeenCalled()
  }

  describe('copyTopicAsMarkdown', () => {
    it('should copy topic as markdown with all basic scenarios', async () => {
      const topic = createTestTopic()
      await testCopyFunction(
        copyTopicAsMarkdown,
        topic,
        'topicToMarkdown',
        '# Test Topic\n\nContent here...'
      )
    })

    it('should handle export function errors', async () => {
      const topic = createTestTopic()
      const { topicToMarkdown } = await import('@renderer/utils/export')
      vi.mocked(topicToMarkdown).mockRejectedValue(new Error('Export error'))

      await expect(copyTopicAsMarkdown(topic)).rejects.toThrow('Export error')
      expect(mockClipboard.writeText).not.toHaveBeenCalled()
      expect(mockMessage.success).not.toHaveBeenCalled()
    })
  })

  describe('copyTopicAsPlainText', () => {
    it('should copy topic as plain text with all basic scenarios', async () => {
      const topic = createTestTopic()
      await testCopyFunction(
        copyTopicAsPlainText,
        topic,
        'topicToPlainText',
        'Test Topic\n\nPlain text content...'
      )
    })

    it('should handle special characters in plain text', async () => {
      const topic = createTestTopic({ name: 'Topic with "quotes" & symbols' })
      const plainTextWithSpecialChars = 'Topic with "quotes" & symbols\n\nContent with <tags> and &entities;'

      const { topicToPlainText } = await import('@renderer/utils/export')
      vi.mocked(topicToPlainText).mockResolvedValue(plainTextWithSpecialChars)
      mockClipboard.writeText.mockResolvedValue(undefined)

      await copyTopicAsPlainText(topic)

      expect(mockClipboard.writeText).toHaveBeenCalledWith(plainTextWithSpecialChars)
      expect(mockMessage.success).toHaveBeenCalledWith('message.copy.success')
    })
  })

  describe('copyMessageAsPlainText', () => {
    it('should copy message as plain text with all basic scenarios', async () => {
      const message = createTestMessage()
      await testCopyFunction(
        copyMessageAsPlainText,
        message,
        'messageToPlainText',
        'This is the plain text content of the message'
      )
    })

    it('should handle messages with markdown formatting', async () => {
      const message = createTestMessage()
      const plainText = 'Header\nBold and italic text\n- List item'

      const { messageToPlainText } = await import('@renderer/utils/export')
      vi.mocked(messageToPlainText).mockReturnValue(plainText)
      mockClipboard.writeText.mockResolvedValue(undefined)

      await copyMessageAsPlainText(message)

      expect(mockClipboard.writeText).toHaveBeenCalledWith(plainText)
      expect(mockMessage.success).toHaveBeenCalledWith('message.copy.success')
    })
  })

  describe('edge cases', () => {
    it('should handle null or undefined inputs gracefully', async () => {
      const { topicToMarkdown, topicToPlainText, messageToPlainText } = await import('@renderer/utils/export')

      // 设置 mock 返回值来测试
      vi.mocked(topicToMarkdown).mockRejectedValue(new Error('Cannot read properties of null'))
      vi.mocked(topicToPlainText).mockRejectedValue(new Error('Cannot read properties of undefined'))
      vi.mocked(messageToPlainText).mockImplementation(() => {
        throw new Error('Cannot read properties of null')
      })

      // 测试 null/undefined 输入
      // @ts-expect-error 测试类型错误
      await expect(copyTopicAsMarkdown(null)).rejects.toThrow('Cannot read properties of null')
      // @ts-expect-error 测试类型错误
      await expect(copyTopicAsPlainText(undefined)).rejects.toThrow('Cannot read properties of undefined')
      // @ts-expect-error 测试类型错误
      await expect(copyMessageAsPlainText(null)).rejects.toThrow('Cannot read properties of null')
    })

    it('should handle clipboard API not available', async () => {
      const message = createTestMessage()
      const { messageToPlainText } = await import('@renderer/utils/export')
      
      vi.mocked(messageToPlainText).mockReturnValue('test')
      mockClipboard.writeText.mockRejectedValue(new Error('Clipboard API not available'))

      await expect(copyMessageAsPlainText(message)).rejects.toThrow('Clipboard API not available')
    })
  })
})