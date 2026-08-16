<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { KeyRound, TriangleAlert } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';

	interface Props {
		open: boolean;
		onClose?: () => void;
		onSuccess?: () => void;
	}

	let { open = $bindable(), onClose, onSuccess }: Props = $props();

	let name = $state('');
	let data = $state('');
	let creating = $state(false);
	let error = $state('');
	let errors = $state<{ name?: string; data?: string }>({});

	function resetForm() {
		name = '';
		data = '';
		creating = false;
		error = '';
		errors = {};
	}

	async function handleSubmit() {
		errors = {};
		let hasErrors = false;
		if (!name.trim()) { errors.name = 'Secret name is required'; hasErrors = true; }
		if (!data) { errors.data = 'Secret content is required'; hasErrors = true; }
		if (hasErrors) return;

		creating = true;
		error = '';
		try {
			const envId = $currentEnvironment?.id;
			const response = await fetch(appendEnvParam('/api/swarm/secrets', envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), data })
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.details || body.error || 'Failed to create secret');
			resetForm();
			open = false;
			onSuccess?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create secret';
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
			<Dialog.Title class="flex items-center gap-2"><KeyRound class="w-5 h-5" />Create secret</Dialog.Title>
			<Dialog.Description>Secret content is base64-encoded on the wire and never stored by Dockhand.</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 mt-4">
			<div class="space-y-2">
				<Label for="secret-name">Name *</Label>
				<Input
					id="secret-name"
					bind:value={name}
					placeholder="my-secret"
					class={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
					oninput={() => errors.name = undefined}
				/>
				{#if errors.name}<p class="text-xs text-destructive">{errors.name}</p>{/if}
			</div>
			<div class="space-y-2">
				<Label for="secret-data">Content *</Label>
				<Textarea
					id="secret-data"
					bind:value={data}
					rows={6}
					class="font-mono text-xs {errors.data ? 'border-destructive focus-visible:ring-destructive' : ''}"
					oninput={() => errors.data = undefined}
				/>
				{#if errors.data}<p class="text-xs text-destructive">{errors.data}</p>{/if}
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
			<Button onclick={handleSubmit} disabled={creating}>{#if creating}Creating...{:else}Create secret{/if}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
