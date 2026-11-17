// ESLint는 앱 실행 전 코드의 실수 가능성을 찾는 도구입니다. npm.cmd run lint로 이 규칙들을 검사합니다.
// 기본 JavaScript/TypeScript 검사에 React Hooks(useState/useEffect 등) 사용 규칙을 더합니다.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
