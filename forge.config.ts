import { resolve } from 'node:path'
import type { ForgeConfig } from '@electron-forge/shared-types'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { WebpackPlugin } from '@electron-forge/plugin-webpack'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { mainConfig } from './webpack.main.config'
import { preloadConfig } from './webpack.preload.config'
import { rendererConfig } from './webpack.renderer.config'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.pzarzycki.tokencompanion',
    appCategoryType: 'public.app-category.developer-tools',
    executableName: 'token-companion',
    icon: resolve('resources/icon')
  },
  rebuildConfig: {
    // classic-level ships prebuilt binaries for the supported Electron range.
    // Skipping rebuild avoids forcing a local node-gyp/Visual Studio toolchain.
    ignoreModules: ['classic-level']
  },
  makers: [],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js: './src/renderer/main.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload/index.ts',
              config: preloadConfig
            }
          }
        ]
      }
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
}

export default config
