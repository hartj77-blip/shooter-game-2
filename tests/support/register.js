// Loaded with `node --import` before the tests run. See importmap-hooks.js.
import { register } from 'node:module';

register('./importmap-hooks.js', import.meta.url);
