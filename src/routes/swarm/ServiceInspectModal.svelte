<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Loader2, Layers } from 'lucide-svelte';
	import ModalHeader from '$lib/components/ModalHeader.svelte';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import SwarmJsonViewer from './SwarmJsonViewer.svelte';

	interface Props {
		open: boolean;
		serviceId: string;
		serviceName?: string;
	}

	let { open = $bindable(), serviceId, serviceName }: Props = $props();

	let loading = $state(true);
	let error = $state('');
	let serviceData = $state<any>(null);

	$effect(() => {
		if (open && serviceId) {
			fetchService();
		}
	});

	async function fetchService() {
		loading = true;
		error = '';
		try {
			const envId = $currentEnvironment?.id ?? null;
			const response = await fetch(appendEnvParam(`/api/swarm/services/${serviceId}`, envId));
			if (!response.ok) throw new Error('Failed to fetch service details');
			serviceData = await response.json();
		} catch (err: any) {
			error = err.message || 'Failed to load service details';
		} finally {
			loading = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-4xl max-h-[90vh] flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
		<Dialog.Header class="shrink-0">
			<ModalHeader icon={Layers} title="Service" name={serviceName || serviceId} />
		</Dialog.Header>
		<div class="flex-1 overflow-auto min-h-0">
			{#if loading}
				<div class="flex items-center justify-center py-8"><Loader2 class="w-6 h-6 animate-spin text-muted-foreground" /></div>
			{:else if error}
				<div class="text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950 rounded">{error}</div>
			{:else if serviceData}
				<SwarmJsonViewer data={serviceData} />
			{/if}
		</div>
		<Dialog.Footer class="shrink-0">
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
