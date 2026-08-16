<script lang="ts">
	interface Props {
		data: unknown;
	}

	let { data }: Props = $props();

	function syntaxHighlight(json: string): string {
		return json
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
				let cls = 'text-orange-500'; // number
				if (/^"/.test(match)) {
					cls = /:$/.test(match) ? 'text-blue-500' : 'text-green-500'; // key : string
				} else if (/true|false/.test(match)) {
					cls = 'text-purple-500';
				} else if (/null/.test(match)) {
					cls = 'text-red-500';
				}
				return `<span class="${cls}">${match}</span>`;
			});
	}

	const jsonLines = $derived((data ? syntaxHighlight(JSON.stringify(data, null, 2)) : '').split('\n'));
</script>

<div class="bg-gray-100 dark:bg-zinc-900 rounded-lg text-xs font-mono overflow-auto h-full">
	<table class="w-full">
		<tbody>
			{#each jsonLines as line, i}
				<tr class="hover:bg-gray-200/50 dark:hover:bg-zinc-800/50">
					<td class="text-right text-gray-400 dark:text-zinc-500 select-none px-3 py-0 border-r border-gray-300 dark:border-zinc-700 sticky left-0 bg-gray-100 dark:bg-zinc-900">{i + 1}</td>
					<td class="px-3 py-0 whitespace-pre text-gray-900 dark:text-gray-100">{@html line || ' '}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
