import { resolve } from 'node:path'
import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { WebpackPlugin } from '@electron-forge/plugin-webpack'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { mainConfig } from './webpack.main.config'
import { rendererConfig } from './webpack.renderer.config'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.pawelzarzycki.tokencompanion',
    appCategoryType: 'public.app-category.developer-tools',
    executableName: 'token-companion',
    icon: resolve('resources/icon')
  },
  rebuildConfig: {
    // classic-level ships prebuilt binaries for the supported Electron range.
    // Skipping rebuild avoids forcing a local node-gyp/Visual Studio toolchain.
    ignoreModules: ['classic-level']
  },
  makers: [
    new MakerDMG({}),
    new MakerSquirrel({
      authors: 'Pawel Zarzycki',
      description: 'Local analyzer for token spend across Claude and Codex sessions',
      name: 'TokenCompanion',
      setupIcon: resolve('resources/icon.ico')
    }),
    new MakerDeb({
      options: {
        maintainer: 'Pawel Zarzycki',
        homepage: 'https://github.com/pzarzycki/token-companion',
        icon: resolve('resources/icon.png')
      }
    }),
    new MakerRpm({
      options: {
        homepage: 'https://github.com/pzarzycki/token-companion',
        icon: resolve('resources/icon.png')
      }
    })
  ],
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
              js: './src/preload/index.ts'
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
