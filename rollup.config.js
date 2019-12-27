import typescript from 'rollup-plugin-typescript2'
import visualizer from 'rollup-plugin-visualizer';
import nodeResolve from '@rollup/plugin-node-resolve';
import pkg from './package.json'


export default {
  input: 'src/index.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs',
    },
    {
      file: pkg.module,
      format: 'es',
    },
  ],
  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ],
  plugins: [
    typescript({
      typescript: require('typescript'),
      objectHashIgnoreUnknownHack: true,
    }),
    // nodeResolve({
    //   jsnext: true
    // }),
    visualizer()
  ],
}
