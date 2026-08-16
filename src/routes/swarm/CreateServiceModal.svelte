<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import * as Select from '$lib/components/ui/select';
	import { Plus, Trash2, Layers, TriangleAlert, MapPin, Tag, Globe } from 'lucide-svelte';
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
	type ConstraintRow = { type: 'hostname' | 'role' | 'label'; labelKey: string; operator: '==' | '!='; value: string };

	let name = $state('');
	let image = $state('');
	let global = $state(false);
	let replicas = $state(1);
	let networkName = $state('');
	let publishedPort = $state('');
	let targetPort = $state('');
	let envVars = $state<KeyValue[]>([]);
	let labels = $state<KeyValue[]>([]);
	let constraints = $state<ConstraintRow[]>([]);

	let traefikEnabled = $state(false);
	let traefikDomain = $state('');
	let traefikEntrypoint = $state('websecure');
	let traefikTls = $state(true);
	let traefikCertResolver = $state('');

	let creating = $state(false);
	let error = $state('');
	let errors = $state<{ name?: string; image?: string }>({});

	function addItem(list: KeyValue[]): KeyValue[] {
		return [...list, { key: '', value: '' }];
	}
	function removeItem(list: KeyValue[], index: number): KeyValue[] {
		return list.filter((_, i) => i !== index);
	}

	function addConstraint() {
		constraints = [...constraints, { type: 'hostname', labelKey: '', operator: '==', value: '' }];
	}
	function removeConstraint(index: number) {
		constraints = constraints.filter((_, i) => i !== index);
	}
	function constraintToString(row: ConstraintRow): string | null {
		if (row.type === 'hostname') {
			return row.value.trim() ? `node.hostname${row.operator}${row.value.trim()}` : null;
		}
		if (row.type === 'role') {
			return row.value.trim() ? `node.role${row.operator}${row.value.trim()}` : null;
		}
		return row.labelKey.trim() && row.value.trim()
			? `node.labels.${row.labelKey.trim()}${row.operator}${row.value.trim()}`
			: null;
	}

	// Regenerate the traefik.* labels whenever the routing fields change, replacing
	// whatever traefik.* rows are already in `labels` (any other label the user added
	// is left untouched). Rows stay in the same editable list either way - this just
	// means edits to a generated row won't survive the next dependency change.
	$effect(() => {
		const enabled = traefikEnabled;
		const domain = traefikDomain;
		const entrypoint = traefikEntrypoint;
		const tls = traefikTls;
		const certResolver = traefikCertResolver;
		const port = targetPort || publishedPort;
		const network = networkName;
		const svcName = name;

		const withoutTraefik = labels.filter((l) => !l.key.startsWith('traefik.'));
		if (!enabled) {
			labels = withoutTraefik;
			return;
		}

		const router = (svcName.trim() || 'service').toLowerCase().replace(/[^a-z0-9-]/g, '-');
		const generated: KeyValue[] = [
			{ key: 'traefik.enable', value: 'true' },
			{ key: `traefik.http.routers.${router}.rule`, value: domain.trim() ? `Host(\`${domain.trim()}\`)` : '' },
			{ key: `traefik.http.routers.${router}.entrypoints`, value: entrypoint.trim() }
		];
		if (tls) {
			generated.push({ key: `traefik.http.routers.${router}.tls`, value: 'true' });
			if (certResolver.trim()) {
				generated.push({ key: `traefik.http.routers.${router}.tls.certresolver`, value: certResolver.trim() });
			}
		}
		if (port.trim()) {
			generated.push({ key: `traefik.http.services.${router}.loadbalancer.server.port`, value: port.trim() });
		}
		if (network.trim()) {
			generated.push({ key: 'traefik.docker.network', value: network.trim() });
		}
		labels = [...withoutTraefik, ...generated];
	});

	function resetForm() {
		name = '';
		image = '';
		global = false;
		replicas = 1;
		networkName = '';
		publishedPort = '';
		targetPort = '';
		envVars = [];
		labels = [];
		constraints = [];
		traefikEnabled = false;
		traefikDomain = '';
		traefikEntrypoint = 'websecure';
		traefikTls = true;
		traefikCertResolver = '';
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

			const constraintStrings = constraints.map(constraintToString).filter((c): c is string => !!c);
			if (constraintStrings.length > 0) {
				(spec.TaskTemplate as any).Placement = { Constraints: constraintStrings };
			}

			// Labels here are service-level (Spec.Labels) - deliberately NOT on
			// ContainerSpec.Labels, since Traefik's Swarm provider (swarmMode: true)
			// reads service-level labels, not the container's own.
			const labelsObj: Record<string, string> = {};
			for (const l of labels) {
				if (l.key.trim()) labelsObj[l.key.trim()] = l.value;
			}
			if (Object.keys(labelsObj).length > 0) {
				spec.Labels = labelsObj;
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

			<!-- Placement constraints -->
			<div class="space-y-2 rounded-md border p-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5">
						<MapPin class="w-4 h-4 text-muted-foreground" />
						<Label>Placement constraints</Label>
					</div>
					<Button variant="outline" size="sm" onclick={addConstraint}>
						<Plus class="w-3.5 h-3.5 mr-1" />Add
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">Pin this service to specific hosts or a host label — set node labels from the Nodes tab.</p>
				{#each constraints as c, i}
					<div class="flex gap-2 items-center">
						<Select.Root type="single" bind:value={c.type}>
							<Select.Trigger class="w-28 h-9 shrink-0">{c.type === 'hostname' ? 'Hostname' : c.type === 'role' ? 'Role' : 'Label'}</Select.Trigger>
							<Select.Content>
								<Select.Item value="hostname" label="Hostname">Hostname</Select.Item>
								<Select.Item value="role" label="Role">Role</Select.Item>
								<Select.Item value="label" label="Label">Label</Select.Item>
							</Select.Content>
						</Select.Root>
						{#if c.type === 'label'}
							<Input bind:value={c.labelKey} placeholder="zone" class="w-24 shrink-0" />
						{/if}
						<Select.Root type="single" bind:value={c.operator}>
							<Select.Trigger class="w-16 h-9 shrink-0">{c.operator}</Select.Trigger>
							<Select.Content>
								<Select.Item value="==" label="==">==</Select.Item>
								<Select.Item value="!=" label="!=">!=</Select.Item>
							</Select.Content>
						</Select.Root>
						<Input bind:value={c.value} placeholder={c.type === 'role' ? 'manager' : c.type === 'hostname' ? 'docker1' : 'east'} class="flex-1" />
						<Button variant="ghost" size="icon" onclick={() => removeConstraint(i)}>
							<Trash2 class="w-4 h-4 text-muted-foreground" />
						</Button>
					</div>
				{/each}
			</div>

			<!-- Traefik routing -->
			<div class="space-y-3 rounded-md border p-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5">
						<Globe class="w-4 h-4 text-muted-foreground" />
						<div>
							<Label>Traefik routing</Label>
							<p class="text-xs text-muted-foreground">Generates traefik.* service labels. Traefik routes to live tasks directly and doesn't depend on Swarm's DNS/VIP.</p>
						</div>
					</div>
					<TogglePill bind:checked={traefikEnabled} />
				</div>
				{#if traefikEnabled}
					<div class="space-y-2">
						<Label for="svc-traefik-domain">Domain</Label>
						<Input id="svc-traefik-domain" bind:value={traefikDomain} placeholder="app.example.com" />
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-2">
							<Label for="svc-traefik-entrypoint">Entrypoint</Label>
							<Input id="svc-traefik-entrypoint" bind:value={traefikEntrypoint} placeholder="websecure" />
						</div>
						<div class="flex items-center justify-between rounded-md border p-2 mt-6">
							<Label class="text-sm">TLS</Label>
							<TogglePill bind:checked={traefikTls} />
						</div>
					</div>
					{#if traefikTls}
						<div class="space-y-2">
							<Label for="svc-traefik-certresolver">Cert resolver</Label>
							<Input id="svc-traefik-certresolver" bind:value={traefikCertResolver} placeholder="letsencrypt (optional)" />
						</div>
					{/if}
					{#if !targetPort.trim() && !publishedPort.trim()}
						<p class="text-xs text-amber-600 dark:text-amber-500">Set a target port above — Swarm mode needs an explicit port for Traefik's load balancer.</p>
					{/if}
				{/if}
			</div>

			<!-- Service labels -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5">
						<Tag class="w-4 h-4 text-muted-foreground" />
						<Label>Labels</Label>
					</div>
					<Button variant="outline" size="sm" onclick={() => labels = addItem(labels)}>
						<Plus class="w-3.5 h-3.5 mr-1" />Add
					</Button>
				</div>
				{#each labels as l, i}
					<div class="flex gap-2">
						<Input bind:value={l.key} placeholder="key" class="flex-1 font-mono text-xs" />
						<Input bind:value={l.value} placeholder="value" class="flex-1 font-mono text-xs" />
						<Button variant="ghost" size="icon" onclick={() => labels = removeItem(labels, i)}>
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
