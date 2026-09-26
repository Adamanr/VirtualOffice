import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'

/**
 * Office-wide browser extensions, installed from the Chrome Web Store by the
 * people who drive a shared browser. CRX packages come straight from Google's
 * update server (signed), are unpacked into `dir`, and loaded into every
 * shared browser (running ones immediately, new ones at start).
 */
export const EXTENSION_ID = /^[a-p]{32}$/
const MAX_CRX = 60 * 1024 * 1024

/** "https://chromewebstore.google.com/detail/name/<id>", an old webstore URL, or a bare id. */
export function parseExtensionId(input) {
  const text = String(input ?? '').trim()
  if (EXTENSION_ID.test(text)) return text
  const m = /(?:^|\/)([a-p]{32})(?:[/?#]|$)/.exec(text)
  return m ? m[1] : null
}

/** CRX2/CRX3 → the zip inside. */
export function crxToZip(buf) {
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'Cr24') {
    // Some mirrors serve the zip directly.
    if (buf.readUInt32LE(0) === 0x04034b50) return buf
    throw new Error('not a CRX package')
  }
  const version = buf.readUInt32LE(4)
  if (version === 3) return buf.subarray(12 + buf.readUInt32LE(8))
  if (version === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12))
  throw new Error(`unsupported CRX version ${version}`)
}

/** Resolves "__MSG_appName__" style names from _locales. */
export async function manifestName(dir, manifest) {
  const name = String(manifest.name ?? '')
  const m = /^__MSG_(\w+)__$/.exec(name)
  if (!m) return name
  for (const locale of ['ru', manifest.default_locale, 'en', 'en_US'].filter(Boolean)) {
    try {
      const messages = JSON.parse(await readFile(path.join(dir, '_locales', locale, 'messages.json'), 'utf8'))
      const entry = Object.entries(messages).find(([k]) => k.toLowerCase() === m[1].toLowerCase())
      if (entry) return entry[1].message
    } catch {
      /* try next */
    }
  }
  return m[1]
}

export class ExtensionStore {
  constructor(dir, log = () => {}) {
    this.dir = dir
    this.log = log
    this.file = path.join(dir, 'enabled.json')
    this.items = []
    this.ready = this.load()
  }

  async load() {
    await mkdir(this.dir, { recursive: true })
    try {
      this.items = JSON.parse(await readFile(this.file, 'utf8')).filter((x) => existsSync(x.dir))
    } catch {
      this.items = []
    }
  }

  list() {
    return this.items
  }

  async save() {
    await writeFile(this.file, JSON.stringify(this.items, null, 2))
  }

  /** Downloads and unpacks an extension. Returns its record. */
  async install(input, chromeVersion) {
    await this.ready
    const id = parseExtensionId(input)
    if (!id) throw new Error('Нужна ссылка на расширение из Chrome Web Store или его ID')
    const existing = this.items.find((x) => x.id === id)
    if (existing) return existing
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(chromeVersion)}&acceptformat=crx2,crx3&x=id%3D${id}%26uc`
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) throw new Error('Расширение не найдено в Chrome Web Store')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_CRX) throw new Error('Расширение слишком большое')
    const target = path.join(this.dir, id)
    await rm(target, { recursive: true, force: true })
    new AdmZip(crxToZip(buf)).extractAllTo(target, true)
    const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'))
    const item = {
      id,
      dir: target,
      name: await manifestName(target, manifest),
      version: String(manifest.version ?? ''),
      popup: manifest.action?.default_popup ?? manifest.browser_action?.default_popup ?? null,
      options: manifest.options_ui?.page ?? manifest.options_page ?? null,
    }
    this.items.push(item)
    await this.save()
    this.log('extension installed', id, item.name)
    return item
  }

  async remove(id) {
    await this.ready
    const item = this.items.find((x) => x.id === id)
    this.items = this.items.filter((x) => x.id !== id)
    await this.save()
    if (item) await rm(item.dir, { recursive: true, force: true })
    return item
  }
}
