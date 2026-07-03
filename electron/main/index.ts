import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { runDubbingPipeline, ensureModels } from './pipeline'
import { getFfmpegPathSafe, downloadFfmpeg } from './ffmpeg'
import { isWhisperReady, isWhisperDownloading, isWhisperCached, clearWhisperCache } from './whisper'
import { isTtsReady, isTtsDownloading, isTtsCached, stopTts, clearTtsCache } from './tts'
import { getVoiceProfiles } from './voice_profiles'
import { openFolder } from './platform'
import { checkPythonDeps } from './python_deps'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'VoiceTransleter V2',
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function send(channel: string, ...args: any[]) {
  mainWindow?.webContents.send(channel, ...args)
}

function setupIpc() {
  ipcMain.handle('dialog:openVideo', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Выберите видеофайл',
      filters: [
        { name: 'Video', extensions: ['mp4', 'avi', 'mkv', 'mov', 'webm'] },
        { name: 'All', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled) return null
    const p = result.filePaths[0]
    const { statSync } = require('fs')
    const stats = statSync(p)
    return { path: p, name: p.split(/[\\/]/).pop(), size: stats.size }
  })

  ipcMain.handle('models:check', () => {
    const pyDeps = checkPythonDeps()
    return {
      whisper: isWhisperReady(),
      whisperCached: isWhisperCached(),
      whisperDownloading: isWhisperDownloading(),
      tts: isTtsReady(),
      ttsCached: isTtsCached(),
      ttsDownloading: isTtsDownloading(),
      ffmpeg: getFfmpegPathSafe(),
      python: pyDeps.python,
      pythonVersion: pyDeps.pythonVersion,
      pythonCompatible: pyDeps.pythonCompatible,
      pythonDeps: pyDeps.fasterWhisper && pyDeps.tts
    }
  })

  ipcMain.handle('models:load', async () => {
    try {
      await ensureModels(
        (msg) => send('pipeline:log', msg),
        (pct) => send('models:progress', pct)
      )
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.on('pipeline:start', async (_, payload) => {
    try {
      send('pipeline:log', '[1/5] Извлечение аудио из видео...')
      send('pipeline:progress', 0.2)

      const result = await runDubbingPipeline(
        payload.videoPath,
        payload.sourceLang,
        payload.voiceId,
        (msg) => send('pipeline:log', msg),
        (pct) => send('pipeline:progress', pct)
      )

      const { dirname } = require('path')
      send('pipeline:done', { success: true, output: result, outputDir: dirname(result) })
    } catch (err: any) {
      send('pipeline:done', { success: false, error: err.message })
    }
  })

  ipcMain.handle('ffmpeg:check', () => {
    return getFfmpegPathSafe()
  })

  ipcMain.handle('ffmpeg:download', async () => {
    try {
      await downloadFfmpeg((msg) => send('pipeline:log', msg))
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:openFile', async (_, filePath: string) => {
    const result = await shell.openPath(filePath)
    if (result) send('pipeline:log', `⚠️ Не удалось открыть файл: ${result}`)
  })

  ipcMain.handle('app:openFolder', async (_, folderPath: string) => {
    try {
      openFolder(folderPath)
    } catch (e: any) {
      const result = await shell.openPath(folderPath)
      if (result) send('pipeline:log', `⚠️ Не удалось открыть папку: ${result}`)
    }
  })

  ipcMain.handle('app:openLink', (_, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.handle('voices:list', () => {
    return getVoiceProfiles()
  })

  ipcMain.handle('voices:add', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Выберите аудиообразец голоса',
      filters: [
        { name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'ogg', 'flac'] },
        { name: 'All', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const src = result.filePaths[0]
    const fs = require('fs')
    const voicesDir = join(app.getPath('userData'), 'voices')
    if (!fs.existsSync(voicesDir)) fs.mkdirSync(voicesDir, { recursive: true })

    const fileName = src.split(/[\\/]/).pop()!
    const dst = join(voicesDir, fileName)
    if (fs.existsSync(dst)) {
      const base = fileName.replace(/\.[^.]+$/, '')
      const ext = fileName.slice(fileName.lastIndexOf('.'))
      const renamed = `${base}_${Date.now()}${ext}`
      return { error: `Файл ${fileName} уже существует. Сохранён как ${renamed}`, name: base, path: join(voicesDir, renamed) }
    }

    try {
      fs.copyFileSync(src, dst)
      return { name: fileName.replace(/\.[^.]+$/, '') }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('voices:dir', () => {
    return join(app.getPath('userData'), 'voices')
  })

  ipcMain.handle('cache:clear', () => {
    clearWhisperCache()
    stopTts()
    clearTtsCache()
    send('pipeline:log', '🧹 Кэш моделей очищен (Whisper и TTS)')
    return { success: true }
  })
}

app.whenReady().then(() => {
  createWindow()
  setupIpc()

  // Tray icon: try dev path, then production resources path
  const devIcon = join(__dirname, '../../logo.jpg')
  const prodIcon = join(process.resourcesPath || '', 'logo.jpg')
  const iconPath = existsSync(devIcon) ? devIcon : prodIcon
  const iconImage = nativeImage.createFromPath(iconPath)
  if (!iconImage.isEmpty()) {
    tray = new Tray(iconImage.resize({ width: 16, height: 16 }))
    tray.setToolTip('VoiceTransleter V2')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Открыть', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Выход', click: () => app.quit() }
    ]))
    tray.on('click', () => mainWindow?.show())
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // auto-load models in background
  setTimeout(async () => {
    if (!getFfmpegPathSafe() || isWhisperReady()) return
    send('pipeline:log', '🔄 Автозагрузка моделей...')
    send('models:progress', 0.05)
    try {
      await ensureModels(
        (msg) => send('pipeline:log', msg),
        (pct) => send('models:progress', pct)
      )
      send('models:loaded', true)
    } catch (err: any) {
      send('pipeline:log', `⚠️ Автозагрузка: ${err.message}`)
    }
  }, 1000)
})

app.on('window-all-closed', () => {
  stopTts()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopTts()
})
