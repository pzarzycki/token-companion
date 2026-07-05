import type { Configuration } from 'webpack'
import { plugins } from './webpack.plugins'
import { makeTsRule, nativeRules, sharedResolve } from './webpack.rules'

export const mainConfig: Configuration = {
  entry: './src/main/index.ts',
  module: {
    rules: [...nativeRules, makeTsRule('tsconfig.node.json')]
  },
  plugins,
  resolve: sharedResolve
}
