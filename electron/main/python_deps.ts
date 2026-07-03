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
    const versionCheck = isPythonVersionCompatible()
    throw new Error(
      versionCheck.reason ||
        `Python ${status.pythonVersion} не поддерживается. Установите Python 3.10 или 3.11 с python.org.`
    )
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
