import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getPythonCommand } from './platform'

/**
 * Check if a Python package is importable.
 * Uses `python -c "import <pkg>"` to verify.
 */
function isPythonPackageInstalled(pkgName: string): boolean {
  const py = getPythonCommand()
  try {
    execSync(`${py} -c "import ${pkgName}"`, {
      stdio: 'pipe',
      timeout: 10000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    return true
  } catch {
    return false
  }
}

/**
 * Check if a Python package is installed via pip.
 */
function isPipPackageInstalled(pkgName: string): boolean {
  const py = getPythonCommand()
  try {
    const result = execSync(`${py} -m pip show "${pkgName}"`, {
      stdio: 'pipe',
      timeout: 15000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    return result.toString().includes('Name:')
  } catch {
    return false
  }
}

/**
 * Install a Python package via pip.
 * Logs progress to onLog callback.
 */
function installPythonPackage(
  pkgName: string,
  onLog?: (msg: string) => void,
  timeout: number = 600000
): void {
  const py = getPythonCommand()
  onLog?.(`  📦 Установка ${pkgName}...`)
  try {
    execSync(`${py} -m pip install --upgrade ${pkgName}`, {
      stdio: 'pipe',
      timeout,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    onLog?.(`  ✅ ${pkgName} установлен`)
  } catch (err: any) {
    onLog?.(`  ❌ Ошибка установки ${pkgName}: ${err.message.slice(0, 200)}`)
    throw new Error(`Failed to install ${pkgName}`)
  }
}

/**
 * Check if Python itself is available.
 */
export function isPythonAvailable(): boolean {
  const py = getPythonCommand()
  try {
    execSync(`${py} --version`, {
      stdio: 'pipe',
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Get the Python version as a string (e.g. "3.11.9").
 */
function getPythonVersion(): string | null {
  const py = getPythonCommand()
  try {
    const output = execSync(`${py} --version 2>&1`, {
      stdio: 'pipe',
      timeout: 5000,
      encoding: 'utf-8',
    })
    // Parse "Python 3.11.9" format
    const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/)
    return match ? `${match[1]}.${match[2]}.${match[3]}` : null
  } catch {
    return null
  }
}

/**
 * Compare semantic versions (e.g. "3.11.9" >= "3.9").
 * Returns: 1 if a > b, 0 if a == b, -1 if a < b
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const maxLen = Math.max(pa.length, pb.length)
  for (let i = 0; i < maxLen; i++) {
    const va = pa[i] || 0
    const vb = pb[i] || 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}

/**
 * Download and install Python 3.11 silently on Windows.
 * Uses the official python.org installer.
 */
async function downloadAndInstallPython311(
  onLog?: (msg: string) => void,
  onProgress?: (pct: number) => void
): Promise<void> {
  const { existsSync, mkdirSync, rmSync, createWriteStream, statSync } = require('fs')
  const { join } = require('path')
  const { app } = require('electron')
  const https = require('https')

  const pyDir = join(app.getPath('userData'), 'python311')
  const installerPath = join(app.getPath('userData'), 'python-3.11.9-amd64.exe')

  // If already installed, skip
  const pyExe = join(pyDir, 'python.exe')
  if (existsSync(pyExe)) {
    onLog?.('  ✅ Python 3.11 уже установлен в папке приложения')
    return
  }

  // Download URL
  const url = 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe'

  onLog?.('  📥 Скачивание Python 3.11.9 (~25 МБ)...')
  onProgress?.(0.02)

  // Download with redirect support
  await new Promise<void>((resolve, reject) => {
    const download = (url: string, redirects: number = 0) => {
      if (redirects > 5) { reject(new Error('Too many redirects')); return }
      https.get(url, (res: any) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          download(res.headers.location, redirects + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`)); return
        }
        const total = parseInt(res.headers['content-length'] || '0')
        let received = 0
        const file = createWriteStream(installerPath)
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total > 0) {
            const pct = 0.02 + (received / total) * 0.08
            onProgress?.(pct)
          }
        })
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
      }).on('error', reject)
    }
    download(url)
  })

  onLog?.('  ✅ Скачивание завершено')
  onProgress?.(0.12)

  // Install silently to app data folder
  onLog?.('  📦 Установка Python 3.11.9...')
  const { execSync } = require('child_process')
  try {
    execSync(`"${installerPath}" /quiet InstallAllUsers=0 TargetDir="${pyDir}" PrependPath=0 Include_pip=1 Include_launcher=0`, {
      stdio: 'pipe',
      timeout: 300000, // 5 minutes
    })
  } catch (err: any) {
    onLog?.(`  ❌ Ошибка установки Python: ${err.message.slice(0, 200)}`)
    throw new Error('Failed to install Python 3.11')
  }

  // Verify installation
  if (!existsSync(pyExe)) {
    throw new Error('Python 3.11 installation failed: python.exe not found')
  }

  // Clean up installer
  try { rmSync(installerPath, { force: true }) } catch {}

  // Install packages into this Python
  onLog?.('  📦 Установка faster-whisper и TTS в новый Python...')
  onProgress?.(0.15)

  try {
    execSync(`"${pyExe}" -m pip install --upgrade pip`, { stdio: 'pipe', timeout: 120000 })
  } catch {}

  try {
    execSync(`"${pyExe}" -m pip install faster-whisper`, { stdio: 'pipe', timeout: 600000 })
    onLog?.('  ✅ faster-whisper установлен')
  } catch {
    throw new Error('Failed to install faster-whisper into embedded Python')
  }

  try {
    execSync(`"${pyExe}" -m pip install TTS`, { stdio: 'pipe', timeout: 600000 })
    onLog?.('  ✅ TTS установлен')
  } catch {
    throw new Error('Failed to install TTS into embedded Python')
  }

  onProgress?.(0.2)
  onLog?.('  ✅ Python 3.11.9 + все зависимости установлены!')
}

/**
 * Check if Python version is compatible (3.9–3.11).
 * Coqui TTS requires Python >=3.9,<3.12.
 */
function isPythonVersionCompatible(): { ok: boolean; version: string; reason?: string } {
  const version = getPythonVersion()
  if (!version) {
    return { ok: false, version: 'unknown', reason: 'Не удалось определить версию Python' }
  }
  if (compareVersions(version, '3.9') < 0) {
    return { ok: false, version, reason: `Python ${version} слишком старый. Требуется Python 3.9–3.11. Скачайте с python.org` }
  }
  if (compareVersions(version, '3.12') >= 0) {
    return { ok: false, version, reason: `Python ${version} не поддерживается. Coqui TTS требует Python 3.9–3.11. Установите Python 3.11 с python.org` }
  }
  return { ok: true, version }
}

/**
 * Check if all required Python packages are installed.
 */
export interface PythonDepsStatus {
  python: boolean
  pythonVersion: string
  pythonCompatible: boolean
  fasterWhisper: boolean
  tts: boolean
}

export function checkPythonDeps(): PythonDepsStatus {
  const pythonOk = isPythonAvailable()
  if (!pythonOk) {
    return { python: false, pythonVersion: '', pythonCompatible: false, fasterWhisper: false, tts: false }
  }
  const versionCheck = isPythonVersionCompatible()
  return {
    python: true,
    pythonVersion: versionCheck.version,
    pythonCompatible: versionCheck.ok,
    fasterWhisper: versionCheck.ok && isPythonPackageInstalled('faster_whisper'),
    tts: versionCheck.ok && isPythonPackageInstalled('TTS'),
  }
}

/**
 * Ensure all required Python packages are installed.
 * Installs missing ones automatically.
 */
export async function ensurePythonDeps(
  onLog?: (msg: string) => void,
  onProgress?: (pct: number) => void
): Promise<void> {
  const status = checkPythonDeps()

  if (!status.python) {
    throw new Error(
      'Python не найден в системе. Установите Python 3.10–3.11 с python.org и попробуйте снова.'
    )
  }

  if (!status.pythonCompatible) {
    // Try to auto-install Python 3.11 (Windows only)
    if (process.platform === 'win32') {
      onLog?.(`⚠️ Python ${status.pythonVersion} несовместим. Автоустановка Python 3.11...`)
      try {
        await downloadAndInstallPython311(onLog, onProgress)
        // Update environment to use embedded Python
        const { join } = require('path')
        const { app } = require('electron')
        const pyExe = join(app.getPath('userData'), 'python311', 'python.exe')
        process.env.VOICE_TRANSLATOR_PYTHON = pyExe
        onLog?.('✅ Python 3.11 установлен и готов к работе')
        // Re-check with new Python
        const newStatus = checkPythonDeps()
        if (!newStatus.python) {
          throw new Error('Установленный Python 3.11 не найден')
        }
        return
      } catch (err: any) {
        throw new Error(
          `Не удалось установить Python 3.11 автоматически: ${err.message}\n` +
          `Установите Python 3.11 вручную с python.org`
        )
      }
    } else {
      const versionCheck = isPythonVersionCompatible()
      throw new Error(
        versionCheck.reason ||
          `Python ${status.pythonVersion} не поддерживается. Установите Python 3.10 или 3.11 с python.org.`
      )
    }
  }

  const missing: string[] = []
  if (!status.fasterWhisper) missing.push('faster-whisper')
  if (!status.tts) missing.push('TTS')

  if (missing.length === 0) {
    onLog?.(`✅ Python-зависимости установлены (Python ${status.pythonVersion})`)
    return
  }

  onLog?.(`📦 Установка Python-зависимостей: ${missing.join(', ')}...`)
  onProgress?.(0.05)

  const total = missing.length
  let installed = 0

  for (const pkg of missing) {
    installPythonPackage(pkg, onLog)
    installed++
    onProgress?.(0.05 + (installed / total) * 0.15)
  }

  onLog?.(`✅ Все Python-зависимости установлены (Python ${status.pythonVersion})`)
  onProgress?.(0.2)
}
