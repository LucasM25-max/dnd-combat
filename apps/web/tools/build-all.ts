import { join } from 'node:path'
import { buildLairScene } from './build-lair'

const root = join(import.meta.dirname, '..', 'public', 'assets')
console.log('\n=== ENDLESS MODE: goblin lair ===')
buildLairScene(join(root, 'lair'))
