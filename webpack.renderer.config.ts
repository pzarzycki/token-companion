import type { Configuration } from 'webpack'
import { plugins } from './webpack.plugins'
import { makeTsRule, nativeRules, sharedResolve } from './webpack.rules'

const rendererRules = [
  ...nativeRules,
  makeTsRule('tsconfig.web.json'),
  {
    test: /\.css$/,
    use: ['style-loader', 'css-loader']
  }
]

export const rendererConfig: Configuration = {
  module: {
    rules: rendererRules
  },
  plugins,
  resolve: sharedResolve
}
