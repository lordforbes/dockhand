<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Link, TriangleAlert } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';

	interface Props {
		open: boolean;
		onClose?: () => void;
		onSuccess?: () => void;
	}

	let { open = $bindable(), onClose, onSuccess }: Props = $props();

	let remoteAddr = $state('');
	let joinToken = $state('');
	let advertiseAddr = $state('');
	let creating = $state(false);
	let error = $state('');
	let errors = $state<{ remoteAddr?: string; joinToken?: string }>({});

	function resetForm() {
		remoteAddr = '';
		joinToken = '';
		advertiseAddr = '';
		creating = false;
		error = '';
		errors = {};
	}

	async function handleSubmit() {
		errors = {};
		let hasErrors = false;
		if (!remoteAddr.trim()) { errors.remoteAddr = 'A manager address is required'; hasErrors = true; }
		if (!joinToken.trim()) { errors.joinToken = 'Join token is required'; hasErrors = true; }
		if (hasErrors) return;

		creating = true;
		error = '';
		try {
			const envId = $currentEnvironment?.id;
			const response = await fetch(appendEnvParam('/api/swarm/join', envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					remoteAddrs: [remoteAddr.trim()],
					joinToken: joinToken.trim(),
					advertiseAddr: advertiseAddr.trim() || undefined
				})
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to join swarm');
			resetForm();
			open = false;
			onSuccess?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join swarm';
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
			<Dialog.Title class="flex items-center gap-2"><Link class="w-5 h-5" />Join swarm</Dialog.Title>
			<Dialog.Description>Joins this environment's Docker daemon to an existing swarm cluster as a manager or worker, depending on the token used.</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 mt-4">
			<div class="space-y-2">
				<Label for="remote-addr">Manager address *</Label>
				<Input
					id="remote-addr"
					bind:value={remoteAddr}
					placeholder="10.0.0.1:2377"
					class={errors.remoteAddr ? 'border-destructive focus-visible:ring-destructive' : ''}
					oninput={() => errors.remoteAddr = undefined}
				/>
				{#if errors.remoteAddr}<p class="text-xs text-destructive">{errors.remoteAddr}</p>{/if}
			</div>
			<div class="space-y-2">
				<Label for="join-token">Join token *</Label>
				<Input
					id="join-token"
					bind:value={joinToken}
					placeholder="SWMTKN-1-..."
					class="font-mono text-xs {errors.joinToken ? 'border-destructive focus-visible:ring-destructive' : ''}"
					oninput={() => errors.joinToken = undefined}
				/>
				<p class="text-xs text-muted-foreground">Copy this from the manager's swarm status panel — worker token joins as a worker, manager token joins as a manager.</p>
				{#if errors.joinToken}<p class="text-xs text-destructive">{errors.joinToken}</p>{/if}
			</div>
			<div class="space-y-2">
				<Label for="join-advertise-addr">Advertise address</Label>
				<Input id="join-advertise-addr" bind:value={advertiseAddr} placeholder="Auto-detected if omitted" />
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
			<Button onclick={handleSubmit} disabled={creating}>{#if creating}Joining...{:else}Join swarm{/if}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
