<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Loader2, ScrollText, RefreshCw } from 'lucide-svelte';
	import ModalHeader from '$lib/components/ModalHeader.svelte';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';

	interface Props {
		open: boolean;
		serviceId: string;
		serviceName?: string;
	}

	let { open = $bindable(), serviceId, serviceName }: Props = $props();

	let loading = $state(true);
	let error = $state('');
	let logs = $state('');

	$effect(() => {
		if (open && serviceId) {
			fetchLogs();
		}
	});

	async function fetchLogs() {
		loading = true;
		error = '';
		try {
			const envId = $currentEnvironment?.id ?? null;
			const response = await fetch(appendEnvParam(`/api/swarm/services/${serviceId}/logs?tail=500`, envId));
			if (!response.ok) throw new Error('Failed to fetch service logs');
			const data = await response.json();
			logs = data.logs || '';
		} catch (err: any) {
			error = err.message || 'Failed to load service logs';
		} finally {
			loading = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-5xl max-h-[90vh] flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
		<Dialog.Header class="shrink-0">
			<ModalHeader icon={ScrollText} title="Service logs" name={serviceName || serviceId} />
		</Dialog.Header>
		<div class="flex-1 overflow-auto min-h-0 bg-gray-100 dark:bg-zinc-900 rounded-lg">
			{#if loading}
				<div class="flex items-center justify-center py-8"><Loader2 class="w-6 h-6 animate-spin text-muted-foreground" /></div>
			{:else if error}
				<div class="text-sm text-red-600 dark:text-red-400 p-3">{error}</div>
			{:else}
				<pre class="text-xs font-mono whitespace-pre-wrap p-3 text-gray-900 dark:text-gray-100">{logs || '(no log output)'}</pre>
			{/if}
		</div>
		<Dialog.Footer class="shrink-0">
			<Button variant="outline" onclick={fetchLogs} disabled={loading}>
				<RefreshCw class="w-4 h-4 mr-1.5 {loading ? 'animate-spin' : ''}" />Refresh
			</Button>
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
