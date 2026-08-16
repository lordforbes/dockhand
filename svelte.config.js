import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Explicit `script: true` works around a known vite/vite-plugin-svelte regression
	// (sveltejs/vite-plugin-svelte#1360) where bare vitePreprocess() silently stops
	// transpiling <script lang="ts"> in certain vite/svelte patch combinations, making
	// `vite build` fail on any optional TS parameter (param?: Type) - including inside
	// third-party .svelte files in node_modules (e.g. layerchart) that we can't edit.
	preprocess: vitePreprocess({ script: true }),

	kit: {
		adapter: adapter({
			out: 'build'
		}),
		csrf: {
			trustedOrigins: ['*']
		}
	}
};

export default config;
