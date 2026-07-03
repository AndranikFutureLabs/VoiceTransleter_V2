import { execSync } from 'child_process'

/**
 * Cross-platform utilities for VoiceTransleter V2
 */

/** Returns true if running on Windows */
export const isWin = process.platform === 'win32'

/** Returns true if running on macOS */
export const isDarwin = process.platform === 'darwin'

/** Returns true if running on Linux */
export const isLinux = process.platform === 'linux'

/**
 * Find the Python executable across platforms.
 * Prioritises Python 3.9–3.11 (required by Coqui TTS).
 * On Windows, tries `python`, then `py -3.11`, then `py -3.10`, then `py -3.9`.
 * On macOS/Linux, tries `python3.11`, `python3.10`, `python3.9`, then `python3`, `python`.
 */
export function getPythonCommand(): string {
  // Check environment override first (set by auto-installer)
  const envPython = process.env.VOICE_TRANSLATOR_PYTHON
  if (envPython) return envPython

  // Check for embedded Python 3.11 in app data folder
  try {
    const { join } = require('path')
    const { app } = require('electron')
    const { existsSync } = require('fs')
    const embeddedPy = join(app.getPath('userData'), 'python311', 'python.exe')
    if (existsSync(embeddedPy)) {
      return embeddedPy
    }
  } catch {}

  // Preferred Python versions for Coqui TTS (3.9–3.11)
  const preferredVersions = ['3.11', '3.10', '3.9']

  if (isWin) {
    // On Windows, try `py -3.11` etc. first (py launcher supports multiple versions)
    for (const ver of preferredVersions) {
      try {
        execSync(`py -${ver} --version`, { stdio: 'pipe', timeout: 5000 })
        return `py -${ver}`
      } catch {}
    }
    // Fall back to `python` — might be a compatible version
    try {
      const out = execSync('python --version 2>&1', { stdio: 'pipe', timeout: 5000, encoding: 'utf-8' })
      const m = out.match(/Python\s+(\d+)\.(\d+)/)
      if (m) {
        const major = parseInt(m[1])
        const minor = parseInt(m[2])
        if (major === 3 && minor >= 9 && minor <= 11) return 'python'
      }
    } catch {}
    // Last resort: try `python` anyway
    try {
      execSync('python --version', { stdio: 'pipe', timeout: 5000 })
      return 'python'
    } catch {
      try {
        execSync('py --version', { stdio: 'pipe', timeout: 5000 })
        return 'py'
      } catch {
        return 'python'
      }
    }
  }

  // macOS / Linux: prefer python3.11, python3.10, python3.9
  for (const ver of preferredVersions) {
    try {
      execSync(`python${ver} --version`, { stdio: 'pipe', timeout: 5000 })
      return `python${ver}`
    } catch {}
  }
  // Fall back to `python3` or `python`
  try {
    const out = execSync('python3 --version 2>&1', { stdio: 'pipe', timeout: 5000, encoding: 'utf-8' })
    const m = out.match(/Python\s+(\d+)\.(\d+)/)
    if (m) {
      const major = parseInt(m[1])
      const minor = parseInt(m[2])
      if (major === 3 && minor >= 9 && minor <= 11) return 'python3'
    }
  } catch {}

  try {
    execSync('python3 --version', { stdio: 'pipe', timeout: 5000 })
    return 'python3'
  } catch {
    try {
      execSync('python --version', { stdio: 'pipe', timeout: 5000 })
      return 'python'
    } catch {
      return 'python3'
    }
  }
}

/**
 * Get the platform-appropriate PATH separator.
 * Windows uses `;`, Unix uses `:`.
 */
export const PATH_SEPARATOR = isWin ? ';' : ':'

/**
 * Open a folder in the platform's file manager.
 * - Windows: explorer
 * - macOS: open
 * - Linux: xdg-open
 */
export function openFolder(folderPath: string): void {
  const { exec } = require('child_process')
  if (isWin) {
    exec(`explorer "${folderPath}"`)
  } else if (isDarwin) {
    exec(`open "${folderPath}"`)
  } else {
    exec(`xdg-open "${folderPath}"`)
  }
}
