<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import { Plus, Trash2, Layers, TriangleAlert } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';

	interface Props {
		open: boolean;
		onClose?: () => void;
		onSuccess?: () => void;
	}

	let { open = $bindable(), onClose, onSuccess }: Props = $props();

	type KeyValue = { key: string; value: string };

	let name = $state('');
	let image = $state('');
	let global = $state(false);
	let replicas = $state(1);
	let networkName = $state('');
	let publishedPort = $state('');
	let targetPort = $state('');
	let envVars = $state<KeyValue[]>([]);

	let creating = $state(false);
	let error = $state('');
	let errors = $state<{ name?: string; image?: string }>({});

	function addItem(list: KeyValue[]): KeyValue[] {
		return [...list, { key: '', value: '' }];
	}
	function removeItem(list: KeyValue[], index: number): KeyValue[] {
		return list.filter((_, i) => i !== index);
	}

	function resetForm() {
		name = '';
		image = '';
		global = false;
		replicas = 1;
		networkName = '';
		publishedPort = '';
		targetPort = '';
		envVars = [];
		creating = false;
		error = '';
		errors = {};
	}

	async function handleSubmit() {
		errors = {};
		let hasErrors = false;

		if (!name.trim()) { errors.name = 'Service name is required'; hasErrors = true; }
		if (!image.trim()) { errors.image = 'Image is required'; hasErrors = true; }
		if (hasErrors) return;

		creating = true;
		error = '';

		try {
			const envId = $currentEnvironment?.id;

			const containerSpec: Record<string, unknown> = { Image: image.trim() };
			const env = envVars.filter((v) => v.key.trim()).map((v) => `${v.key}=${v.value}`);
			if (env.length > 0) containerSpec.Env = env;

			const spec: Record<string, unknown> = {
				Name: name.trim(),
				TaskTemplate: { ContainerSpec: containerSpec },
				Mode: global ? { Global: {} } : { Replicated: { Replicas: replicas } }
			};

			if (networkName.trim()) {
				(spec.TaskTemplate as any).Networks = [{ Target: networkName.trim() }];
			}

			if (publishedPort.trim() && targetPort.trim()) {
				spec.EndpointSpec = {
					Ports: [{ Protocol: 'tcp', PublishedPort: parseInt(publishedPort), TargetPort: parseInt(targetPort) }]
				};
			}

			const response = await fetch(appendEnvParam('/api/swarm/services', envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(spec)
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.details || data.error || 'Failed to create service');
			}
			resetForm();
			open = false;
			onSuccess?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create service';
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
	<Dialog.Content class="max-w-2xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2"><Layers class="w-5 h-5" />Create service</Dialog.Title>
			<Dialog.Description>Deploy a new service to the swarm cluster.</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 mt-4">
			<div class="space-y-2">
				<Label for="svc-name">Service name *</Label>
				<Input
					id="svc-name"
					bind:value={name}
					placeholder="my-service"
					class={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
					oninput={() => errors.name = undefined}
				/>
				{#if errors.name}<p class="text-xs text-destructive">{errors.name}</p>{/if}
			</div>

			<div class="space-y-2">
				<Label for="svc-image">Image *</Label>
				<Input
					id="svc-image"
					bind:value={image}
					placeholder="nginx:latest"
					class={errors.image ? 'border-destructive focus-visible:ring-destructive' : ''}
					oninput={() => errors.image = undefined}
				/>
				{#if errors.image}<p class="text-xs text-destructive">{errors.image}</p>{/if}
			</div>

			<div class="flex items-center justify-between rounded-md border p-3">
				<div>
					<Label>Global mode</Label>
					<p class="text-xs text-muted-foreground">Run exactly one task on every node, instead of a fixed replica count.</p>
				</div>
				<TogglePill bind:checked={global} />
			</div>

			{#if !global}
				<div class="space-y-2">
					<Label for="svc-replicas">Replicas</Label>
					<Input id="svc-replicas" type="number" min="0" bind:value={replicas} />
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="svc-network">Overlay network</Label>
				<Input id="svc-network" bind:value={networkName} placeholder="my-overlay-net (optional)" />
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-2">
					<Label for="svc-published-port">Published port</Label>
					<Input id="svc-published-port" type="number" min="1" max="65535" bind:value={publishedPort} placeholder="8080" />
				</div>
				<div class="space-y-2">
					<Label for="svc-target-port">Target port</Label>
					<Input id="svc-target-port" type="number" min="1" max="65535" bind:value={targetPort} placeholder="80" />
				</div>
			</div>

			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<Label>Environment variables</Label>
					<Button variant="outline" size="sm" onclick={() => envVars = addItem(envVars)}>
						<Plus class="w-3.5 h-3.5 mr-1" />Add
					</Button>
				</div>
				{#each envVars as v, i}
					<div class="flex gap-2">
						<Input bind:value={v.key} placeholder="KEY" class="flex-1" />
						<Input bind:value={v.value} placeholder="value" class="flex-1" />
						<Button variant="ghost" size="icon" onclick={() => envVars = removeItem(envVars, i)}>
							<Trash2 class="w-4 h-4 text-muted-foreground" />
						</Button>
					</div>
				{/each}
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
			<Button onclick={handleSubmit} disabled={creating}>{#if creating}Creating...{:else}Create service{/if}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
