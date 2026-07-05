import type { Configuration } from 'webpack'
import { plugins } from './webpack.plugins'
import { makeTsRule, sharedResolve } from './webpack.rules'

export const preloadConfig: Configuration = {
  module: {
    rules: [makeTsRule('tsconfig.node.json')]
  },
  plugins,
  resolve: sharedResolve
}
