import babel from '@rollup/plugin-babel';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { copy } from './copy.js';
import typescript from '@rollup/plugin-typescript';

export default {
  input: './summary-html.ts',
  output: {
    file: './dist/summary-html.js',
    format: 'cjs',
    plugins: [copy()],
  },
  treeshake: true,
  plugins: [
    typescript({ compilerOptions: { lib: ['es6', 'dom'], target: 'es2015' } }),
    nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
    commonjs(),
    babel({ babelHelpers: 'bundled', extensions: ['.js', '.jsx', '.es6', '.es', '.mjs', '.ts'] }),
    json(),
  ],
};
