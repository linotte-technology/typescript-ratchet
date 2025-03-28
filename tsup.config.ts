import { defineConfig } from 'tsup'

export default defineConfig({
  format: ['cjs'],
  entry: [
    'src/index.ts',
    'src/typecheck.worker.ts',
    'src/ts-morph.worker.ts',
    'src/expect-error.transformer.ts'
  ]
})
