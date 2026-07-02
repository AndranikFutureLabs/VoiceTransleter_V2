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
 * On Windows, `python` is typical (Python installed from python.org or via py launcher).
 * On macOS/Linux, `python3` is the norm.
 */
export function getPythonCommand(): string {
  // Check environment override first
  const envPython = process.env.VOICE_TRANSLATOR_PYTHON
  if (envPython) return envPython

  if (isWin) {
    // On Windows, try `python` first, then `py`
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

  // macOS / Linux: prefer python3
  try {
    execSync('python3 --version', { stdio: 'pipe', timeout: 5000 })
    return 'python3'
  } catch {
    // Fall back to `python` (some systems alias it)
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
