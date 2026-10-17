// Entry point: the engine runs the film.
import { start } from './engine.js';
import * as film from './film.js';

window.__film.ready = start(film);
