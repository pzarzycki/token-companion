import { resolve } from 'node:path'
import type { Configuration, ModuleOptions } from 'webpack'

const sharedAlias = resolve(__dirname, 'src/shared')

export const sharedResolve: Configuration['resolve'] = {
  alias: {
    '@shared': sharedAlias
  },
  extensions: ['.js', '.ts', '.tsx', '.jsx', '.css', '.json']
}

export const nativeRules: Required<ModuleOptions>['rules'] = [
  {
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader'
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules'
      }
    }
  },
]

export function makeTsRule(
  configFile: string
): Required<ModuleOptions>['rules'][number] {
  return {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: {
        configFile: resolve(__dirname, configFile),
        transpileOnly: true
      }
    }
  }
}
