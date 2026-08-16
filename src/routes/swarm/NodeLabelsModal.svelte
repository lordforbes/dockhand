<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Plus, Trash2, Tag, TriangleAlert } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { focusFirstInput } from '$lib/utils';

	type KeyValue = { key: string; value: string };

	interface Props {
		open: boolean;
		node: { id: string; hostname: string; version: number; labels: Record<string, string> } | null;
		onClose?: () => void;
		onSuccess?: () => void;
	}

	let { open = $bindable(), node, onClose, onSuccess }: Props = $props();

	let labels = $state<KeyValue[]>([]);
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		if (open && node) {
			labels = Object.entries(node.labels || {}).map(([key, value]) => ({ key, value }));
			if (labels.length === 0) labels = [{ key: '', value: '' }];
			error = '';
		}
	});

	function addItem() {
		labels = [...labels, { key: '', value: '' }];
	}
	function removeItem(index: number) {
		labels = labels.filter((_, i) => i !== index);
	}

	async function handleSubmit() {
		if (!node) return;
		saving = true;
		error = '';
		try {
			const labelsObj: Record<string, string> = {};
			for (const l of labels) {
				if (l.key.trim()) labelsObj[l.key.trim()] = l.value;
			}

			const envId = $currentEnvironment?.id;
			const response = await fetch(appendEnvParam(`/api/swarm/nodes/${node.id}`, envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ version: node.version, labels: labelsObj })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to update labels');
			open = false;
			onSuccess?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update labels';
		} finally {
			saving = false;
		}
	}

	function handleClose() {
		error = '';
		onClose?.();
	}
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => { if (isOpen) focusFirstInput(); else handleClose(); }}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2"><Tag class="w-5 h-5" />Node labels</Dialog.Title>
			<Dialog.Description>Labels on {node?.hostname} — reference them in service placement constraints as <code>node.labels.&lt;key&gt;==&lt;value&gt;</code>.</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-2 mt-4">
			{#each labels as l, i}
				<div class="flex gap-2">
					<Input bind:value={l.key} placeholder="zone" class="flex-1" />
					<Input bind:value={l.value} placeholder="east" class="flex-1" />
					<Button variant="ghost" size="icon" onclick={() => removeItem(i)}>
						<Trash2 class="w-4 h-4 text-muted-foreground" />
					</Button>
				</div>
			{/each}
			<Button variant="outline" size="sm" onclick={addItem}>
				<Plus class="w-3.5 h-3.5 mr-1" />Add label
			</Button>
		</div>

		{#if error}
			<Alert.Root variant="destructive" class="mt-4">
				<TriangleAlert class="h-4 w-4" />
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		<Dialog.Footer class="mt-6">
			<Button variant="outline" onclick={handleClose} disabled={saving}>Cancel</Button>
			<Button onclick={handleSubmit} disabled={saving}>{#if saving}Saving...{:else}Save labels{/if}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
