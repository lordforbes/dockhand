<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Boxes, TriangleAlert } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';

	interface Props {
		open: boolean;
		onClose?: () => void;
		onSuccess?: () => void;
	}

	let { open = $bindable(), onClose, onSuccess }: Props = $props();

	let advertiseAddr = $state('');
	let listenAddr = $state('');
	let creating = $state(false);
	let error = $state('');
	let errors = $state<{ advertiseAddr?: string }>({});

	function resetForm() {
		advertiseAddr = '';
		listenAddr = '';
		creating = false;
		error = '';
		errors = {};
	}

	async function handleSubmit() {
		errors = {};
		if (!advertiseAddr.trim()) {
			errors.advertiseAddr = 'Advertise address is required — the IP/interface other nodes will reach this manager on';
			return;
		}

		creating = true;
		error = '';
		try {
			const envId = $currentEnvironment?.id;
			const response = await fetch(appendEnvParam('/api/swarm', envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					advertiseAddr: advertiseAddr.trim(),
					listenAddr: listenAddr.trim() || undefined
				})
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to initialize swarm');
			resetForm();
			open = false;
			onSuccess?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to initialize swarm';
		} finally {
			creating = false;
		}
	}

	function handleClose() {
		resetForm();
		onClose?.();
	}
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => { if (isOpen) focusFirstInput(); else handleClose(); }}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2"><Boxes class="w-5 h-5" />Initialize swarm</Dialog.Title>
			<Dialog.Description>Makes this environment's Docker daemon the first manager of a new swarm cluster.</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 mt-4">
			<div class="space-y-2">
				<Label for="advertise-addr">Advertise address *</Label>
				<Input
					id="advertise-addr"
					bind:value={advertiseAddr}
					placeholder="10.0.0.1:2377"
					class={errors.advertiseAddr ? 'border-destructive focus-visible:ring-destructive' : ''}
					oninput={() => errors.advertiseAddr = undefined}
				/>
				<p class="text-xs text-muted-foreground">The IP/interface other nodes will use to reach this manager. Must be routable from every node that will join.</p>
				{#if errors.advertiseAddr}<p class="text-xs text-destructive">{errors.advertiseAddr}</p>{/if}
			</div>
			<div class="space-y-2">
				<Label for="listen-addr">Listen address</Label>
				<Input id="listen-addr" bind:value={listenAddr} placeholder="0.0.0.0:2377 (default)" />
			</div>
		</div>

		{#if error}
			<Alert.Root variant="destructive" class="mt-4">
				<TriangleAlert class="h-4 w-4" />
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		<Dialog.Footer class="mt-6">
			<Button variant="outline" onclick={handleClose} disabled={creating}>Cancel</Button>
			<Button onclick={handleSubmit} disabled={creating}>{#if creating}Initializing...{:else}Initialize swarm{/if}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
