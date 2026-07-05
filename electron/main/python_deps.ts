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
 * Download and install Python 3.11 from NuGet package.
 * NuGet package is a zip archive that includes EVERYTHING needed:
 * - python.exe (full, not embedded)
 * - Python.h + headers (for C extension compilation like TTS)
 * - python311.lib (linker library)
 * - pip (pre-installed)
 * No installer, no admin rights, no 1603 errors.
 */
async function downloadAndInstallPython311(
  onLog?: (msg: string) => void,
  onProgress?: (pct: number) => void
): Promise<void> {
  const { existsSync, mkdirSync, rmSync, createWriteStream } = require('fs')
  const { join } = require('path')
  const { app } = require('electron')
  const https = require('https')
  const { execSync } = require('child_process')

  const pyDir = join(app.getPath('userData'), 'python311')
  const pyExe = join(pyDir, 'python.exe')

  // If already installed, skip
  if (existsSync(pyExe)) {
    onLog?.('  ✅ Python 3.11 уже установлен в папке приложения')
    return
  }

  // Clean up partial install
  if (existsSync(pyDir)) {
    try { rmSync(pyDir, { recursive: true, force: true }) } catch {}
  }
  mkdirSync(pyDir, { recursive: true })

  // Download Python 3.11.9 — try multiple sources with retries
  // NuGet package includes EVERYTHING: python.exe, Python.h, python311.lib, pip
  const zipPath = join(app.getPath('userData'), 'python-3.11.9-nuget.zip')
  const downloadSources = [
    'https://www.nuget.org/api/v2/package/python/3.11.9',
    'https://globalcdn.nuget.org/packages/python.3.11.9.nupkg',
  ]

  onLog?.('  📥 Скачивание Python 3.11.9 (~25 МБ)...')
  onProgress?.(0.02)

  let downloadOk = false
  let lastErr = ''

  for (let srcIdx = 0; srcIdx < downloadSources.length && !downloadOk; srcIdx++) {
    const url = downloadSources[srcIdx]
    for (let attempt = 1; attempt <= 3 && !downloadOk; attempt++) {
      onLog?.(`  🔄 Скачивание (источник ${srcIdx + 1}, попытка ${attempt}/3)...`)
      try {
        await new Promise<void>((resolve, reject) => {
          const download = (dlUrl: string, redirects: number = 0) => {
            if (redirects > 5) { reject(new Error('Too many redirects')); return }
            const req = https.get(dlUrl, (res: any) => {
              if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
                download(res.headers.location, redirects + 1)
                return
              }
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`)); return
              }
              const total = parseInt(res.headers['content-length'] || '0')
              let received = 0
              const file = createWriteStream(zipPath)
              res.on('data', (chunk: Buffer) => {
                received += chunk.length
                if (total > 0) {
                  onProgress?.(0.02 + (received / total) * 0.08)
                }
              })
              res.pipe(file)
              file.on('finish', () => { file.close(); resolve() })
              file.on('error', (e: any) => { try { rmSync(zipPath, { force: true }) } catch {}; reject(e) })
            })
            req.on('error', (e: any) => { try { rmSync(zipPath, { force: true }) } catch {}; reject(e) })
            req.setTimeout(120000, () => { req.destroy(); try { rmSync(zipPath, { force: true }) } catch {}; reject(new Error('Download timeout')) })
          }
          download(url)
        })
        downloadOk = true
      } catch (err: any) {
        lastErr = err.message
        onLog?.(`  ⚠️ Ошибка: ${lastErr.slice(0, 100)}`)
        if (attempt < 3) {
          onLog?.('  ⏳ Повтор через 3 сек...')
          await new Promise(r => setTimeout(r, 3000))
        }
      }
    }
  }

  if (!downloadOk) {
    throw new Error(`Не удалось скачать Python: ${lastErr}`)
  }

  onLog?.('  ✅ Скачивание завершено')
  onProgress?.(0.12)

  // Unzip — NuGet package structure: tools/* contains Python
  // We extract tools/ contents directly into pyDir
  onLog?.('  📦 Распаковка Python 3.11.9...')
  try {
    // Use PowerShell to unzip (available on all Windows 10+)
    // Extract everything to a temp dir, then move tools/ contents
    const tempDir = join(app.getPath('userData'), 'python-nuget-temp')
    if (existsSync(tempDir)) {
      try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
    }
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`,
      { stdio: 'pipe', timeout: 120000 }
    )
    // Move tools/* contents into pyDir
    const toolsDir = join(tempDir, 'tools')
    if (existsSync(toolsDir)) {
      // Use robocopy to move contents (more reliable than PowerShell Move-Item for large dirs)
      execSync(
        `robocopy "${toolsDir}" "${pyDir}" /E /MOVE /NFL /NDL /NJH /NJS /NC /NS /NP`,
        { stdio: 'pipe', timeout: 120000 }
      )
    }
    // Clean up temp dir
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
  } catch (err: any) {
    onLog?.(`  ❌ Ошибка распаковки: ${err.message.slice(0, 200)}`)
    throw new Error('Failed to unzip Python')
  }

  // Verify python.exe
  if (!existsSync(pyExe)) {
    try {
      const { readdirSync } = require('fs')
      const files = readdirSync(pyDir)
      onLog?.(`  ⚠️ python.exe не найден. Содержимое: ${files.slice(0, 10).join(', ')}`)
    } catch {}
    throw new Error('python.exe not found after extraction')
  }

  // Verify Python.h exists (needed for TTS C extension compilation)
  const pythonH = join(pyDir, 'include', 'Python.h')
  if (!existsSync(pythonH)) {
    onLog?.('  ⚠️ Python.h не найден — C-расширения могут не компилироваться')
  } else {
    onLog?.('  ✅ Python.h найден — C-расширения будут компилироваться')
  }

  // Clean up zip
  try { rmSync(zipPath, { force: true }) } catch {}

  // Ensure pip is available
  try {
    execSync(`"${pyExe}" -m ensurepip --upgrade`, {
      stdio: 'pipe', timeout: 60000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
  } catch {}

  await installDependencies(pyExe, pyDir, onLog, onProgress)
}

/**
 * Install faster-whisper and TTS dependencies into the given Python.
 */
async function installDependencies(
  pyExe: string,
  _pyDir: string,
  onLog?: (msg: string) => void,
  onProgress?: (pct: number) => void
): Promise<void> {
  // Install faster-whisper
  onLog?.('  📦 Установка faster-whisper...')
  onProgress?.(0.15)
  try {
    execSync(`"${pyExe}" -m pip install --no-warn-script-location faster-whisper`, {
      stdio: 'pipe',
      timeout: 600000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    onLog?.('  ✅ faster-whisper установлен')
  } catch {
    throw new Error('Failed to install faster-whisper')
  }

  // Pre-install TTS build dependencies (numpy, cython needed for TTS C extension compilation)
  onLog?.('  📦 Установка зависимостей для TTS...')
  try {
    execSync(`"${pyExe}" -m pip install --no-warn-script-location numpy cython`, {
      stdio: 'pipe',
      timeout: 300000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
  } catch {}

  // Install TTS (Coqui) — needs C headers (Python.h) + libs (python311.lib) to compile
  onLog?.('  📦 Установка TTS (Coqui, ~5-10 мин)...')
  try {
    execSync(`"${pyExe}" -m pip install --no-warn-script-location TTS`, {
      stdio: 'pipe',
      timeout: 1800000, // 30 minutes
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PIP_DEFAULT_TIMEOUT: '300' },
      encoding: 'utf-8',
    })
    onLog?.('  ✅ TTS установлен')
  } catch (err: any) {
    const stderr = err.stderr?.toString() || ''
    const stdout = err.stdout?.toString() || ''
    onLog?.(`  ⚠️ stderr: ${stderr.slice(-500)}`)
    onLog?.(`  ⚠️ stdout: ${stdout.slice(-500)}`)

    // Retry with --no-build-isolation (uses already-installed numpy/cython)
    onLog?.('  🔄 Повторная установка TTS (--no-build-isolation)...')
    try {
      execSync(`"${pyExe}" -m pip install --no-warn-script-location --no-build-isolation TTS`, {
        stdio: 'pipe',
        timeout: 1800000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PIP_DEFAULT_TIMEOUT: '300' },
      })
      onLog?.('  ✅ TTS установлен (повтор)')
    } catch (err2: any) {
      const stderr2 = err2.stderr?.toString() || ''
      onLog?.(`  ❌ Ошибка TTS: ${stderr2.slice(-500)}`)
      throw new Error(`Failed to install TTS: ${stderr2.slice(-300)}`)
    }
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
    // Python not found at all — try auto-install on Windows
    if (process.platform === 'win32') {
      onLog?.('📦 Python не найден. Автоустановка Python 3.11...')
      try {
        await downloadAndInstallPython311(onLog, onProgress)
        // downloadAndInstallPython311 may set VOICE_TRANSLATOR_PYTHON if TargetDir failed
        if (!process.env.VOICE_TRANSLATOR_PYTHON) {
          const { join } = require('path')
          const { app } = require('electron')
          const pyExe = join(app.getPath('userData'), 'python311', 'python.exe')
          process.env.VOICE_TRANSLATOR_PYTHON = pyExe
        }
        onLog?.('✅ Python 3.11 установлен и готов к работе')
        return
      } catch (err: any) {
        throw new Error(
          `Не удалось установить Python 3.11 автоматически: ${err.message}\n` +
          `Установите Python 3.11 вручную с python.org`
        )
      }
    }
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
        // downloadAndInstallPython311 may set VOICE_TRANSLATOR_PYTHON if TargetDir failed
        if (!process.env.VOICE_TRANSLATOR_PYTHON) {
          const { join } = require('path')
          const { app } = require('electron')
          const pyExe = join(app.getPath('userData'), 'python311', 'python.exe')
          process.env.VOICE_TRANSLATOR_PYTHON = pyExe
        }
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
