<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Tabs from '$lib/components/ui/tabs';
	import { EmptyState, NoEnvironment } from '$lib/components/ui/empty-state';
	import ConfirmPopover from '$lib/components/ConfirmPopover.svelte';
	import {
		Boxes, Server, Layers, KeyRound, Sliders, Plus, RefreshCw, Trash2, Eye, ScrollText,
		Link, LogOut, Crown, PauseCircle, PlayCircle, ArrowUpCircle, ArrowDownCircle, Copy, Check, Loader2, Tag,
		Globe, ExternalLink
	} from 'lucide-svelte';
	import { currentEnvironment, appendEnvParam } from '$lib/stores/environment';
	import { canAccess } from '$lib/stores/auth';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { formatDateTime, appSettings } from '$lib/stores/settings';
	import { extractTraefikUrls } from '$lib/utils/traefik-urls';

	import InitSwarmModal from './InitSwarmModal.svelte';
	import JoinSwarmModal from './JoinSwarmModal.svelte';
	import NodeInspectModal from './NodeInspectModal.svelte';
	import ServiceInspectModal from './ServiceInspectModal.svelte';
	import ServiceLogsModal from './ServiceLogsModal.svelte';
	import CreateServiceModal from './CreateServiceModal.svelte';
	import CreateSecretModal from './CreateSecretModal.svelte';
	import CreateConfigModal from './CreateConfigModal.svelte';
	import NodeLabelsModal from './NodeLabelsModal.svelte';

	interface SwarmStatus {
		active: boolean;
		isManager: boolean;
		nodeId: string | null;
		nodeAddr: string | null;
		error: string | null;
		managers: number;
		nodes: number;
		clusterId: string | null;
		joinTokens?: { worker: string; manager: string };
	}

	let status = $state<SwarmStatus | null>(null);
	let statusLoading = $state(true);
	let envId = $state<number | null>(null);

	let activeTab = $derived($page.url.searchParams.get('tab') || 'nodes');
	function handleTabChange(tab: string) {
		goto(`/swarm?tab=${tab}`, { replaceState: true, noScroll: true });
	}

	let nodes = $state<any[]>([]);
	let services = $state<any[]>([]);
	let secrets = $state<any[]>([]);
	let configs = $state<any[]>([]);
	let listLoading = $state(false);

	let showInitModal = $state(false);
	let showJoinModal = $state(false);
	let showTokens = $state(false);
	let copiedToken = $state<'worker' | 'manager' | null>(null);

	let showCreateService = $state(false);
	let showCreateSecret = $state(false);
	let showCreateConfig = $state(false);

	let inspectNodeId = $state('');
	let inspectNodeName = $state('');
	let showNodeInspect = $state(false);

	let editLabelsNode = $state<any>(null);
	let showNodeLabels = $state(false);

	let inspectServiceId = $state('');
	let inspectServiceName = $state('');
	let showServiceInspect = $state(false);
	let showServiceLogs = $state(false);

	let initialFetchDone = $state(false);

	$effect(() => {
		const env = $currentEnvironment;
		const newEnvId = env?.id ?? null;
		if (env && (newEnvId !== envId || !initialFetchDone)) {
			envId = newEnvId;
			initialFetchDone = true;
			fetchStatus();
		} else if (!env) {
			envId = null;
			status = null;
			statusLoading = false;
		}
	});

	async function fetchStatus() {
		statusLoading = true;
		try {
			const response = await fetch(appendEnvParam('/api/swarm', envId));
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			status = await response.json();
			if (status?.active) {
				await fetchTabData();
			} else {
				nodes = []; services = []; secrets = []; configs = [];
			}
		} catch (err) {
			console.error('Failed to fetch swarm status:', err);
			toast.error('Failed to load swarm status');
		} finally {
			statusLoading = false;
		}
	}

	async function fetchTabData() {
		listLoading = true;
		try {
			const [n, s, sec, cfg] = await Promise.all([
				fetch(appendEnvParam('/api/swarm/nodes', envId)).then(r => r.ok ? r.json() : []),
				fetch(appendEnvParam('/api/swarm/services', envId)).then(r => r.ok ? r.json() : []),
				fetch(appendEnvParam('/api/swarm/secrets', envId)).then(r => r.ok ? r.json() : []),
				fetch(appendEnvParam('/api/swarm/configs', envId)).then(r => r.ok ? r.json() : [])
			]);
			nodes = n; services = s; secrets = sec; configs = cfg;
		} catch (err) {
			console.error('Failed to fetch swarm resources:', err);
			toast.error('Failed to load swarm resources');
		} finally {
			listLoading = false;
		}
	}

	async function copyToken(kind: 'worker' | 'manager', token: string) {
		const ok = await copyToClipboard(token);
		if (ok) {
			copiedToken = kind;
			setTimeout(() => copiedToken = null, 2000);
		}
	}

	async function leaveSwarm() {
		try {
			const response = await fetch(appendEnvParam('/api/swarm/leave', envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ force: false })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to leave swarm');
			toast.success('Left the swarm');
			fetchStatus();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to leave swarm');
		}
	}

	async function updateNode(node: any, updates: { role?: string; availability?: string }) {
		try {
			const response = await fetch(appendEnvParam(`/api/swarm/nodes/${node.id}`, envId), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ version: node.version, ...updates })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to update node');
			toast.success('Node updated');
			fetchTabData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to update node');
		}
	}

	async function removeNode(node: any) {
		try {
			const response = await fetch(appendEnvParam(`/api/swarm/nodes/${node.id}`, envId), { method: 'DELETE' });
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to remove node');
			toast.success('Node removed');
			fetchTabData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to remove node');
		}
	}

	async function removeService(service: any) {
		try {
			const response = await fetch(appendEnvParam(`/api/swarm/services/${service.id}`, envId), { method: 'DELETE' });
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to remove service');
			toast.success('Service removed');
			fetchTabData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to remove service');
		}
	}

	async function removeSecret(secret: any) {
		try {
			const response = await fetch(appendEnvParam(`/api/swarm/secrets/${secret.id}`, envId), { method: 'DELETE' });
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to remove secret');
			toast.success('Secret removed');
			fetchTabData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to remove secret');
		}
	}

	async function removeConfig(config: any) {
		try {
			const response = await fetch(appendEnvParam(`/api/swarm/configs/${config.id}`, envId), { method: 'DELETE' });
			const data = await response.json();
			if (!response.ok) throw new Error(data.details || data.error || 'Failed to remove config');
			toast.success('Config removed');
			fetchTabData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to remove config');
		}
	}

	function openNodeInspect(node: any) {
		inspectNodeId = node.id;
		inspectNodeName = node.hostname;
		showNodeInspect = true;
	}
	function openNodeLabels(node: any) {
		editLabelsNode = node;
		showNodeLabels = true;
	}
	function openServiceInspect(service: any) {
		inspectServiceId = service.id;
		inspectServiceName = service.name;
		showServiceInspect = true;
	}
	function openServiceLogs(service: any) {
		inspectServiceId = service.id;
		inspectServiceName = service.name;
		showServiceLogs = true;
	}
</script>

<div class="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
	<div class="flex items-center justify-between gap-2 flex-wrap">
		<PageHeader icon={Boxes} title="Swarm" />
		{#if status?.active}
			<Button variant="outline" size="sm" onclick={fetchStatus} disabled={statusLoading || listLoading}>
				<RefreshCw class="w-4 h-4 mr-1.5 {(statusLoading || listLoading) ? 'animate-spin' : ''}" />Refresh
			</Button>
		{/if}
	</div>

	{#if !statusLoading && !$currentEnvironment}
		<NoEnvironment />
	{:else if statusLoading}
		<div class="flex items-center justify-center py-12"><Loader2 class="w-6 h-6 animate-spin text-muted-foreground" /></div>
	{:else if status}
		<div class="rounded-lg border p-4 flex flex-col gap-3">
			<div class="flex items-center justify-between flex-wrap gap-3">
				<div class="flex items-center gap-3">
					{#if status.active}
						<Badge variant="default" class="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
						{#if status.isManager}<Badge variant="secondary"><Crown class="w-3 h-3 mr-1" />Manager</Badge>{/if}
						<span class="text-sm text-muted-foreground">{status.managers} manager(s) · {status.nodes} node(s)</span>
					{:else}
						<Badge variant="secondary">Not in a swarm</Badge>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					{#if !status.active && $canAccess('swarm', 'manage')}
						<Button variant="outline" size="sm" onclick={() => showJoinModal = true}>
							<Link class="w-4 h-4 mr-1.5" />Join existing swarm
						</Button>
						<Button size="sm" onclick={() => showInitModal = true}>
							<Boxes class="w-4 h-4 mr-1.5" />Initialize swarm
						</Button>
					{:else if status.active && $canAccess('swarm', 'manage')}
						{#if status.isManager}
							<Button variant="outline" size="sm" onclick={() => showTokens = !showTokens}>
								{showTokens ? 'Hide' : 'Show'} join tokens
							</Button>
						{/if}
						<ConfirmPopover action="Leave" itemType="swarm" itemName={$currentEnvironment?.name} title="Leave swarm" onConfirm={leaveSwarm}>
							{#snippet children({ open })}
								<Button variant="outline" size="sm" class={open ? 'text-destructive' : ''}>
									<LogOut class="w-4 h-4 mr-1.5" />Leave swarm
								</Button>
							{/snippet}
						</ConfirmPopover>
					{/if}
				</div>
			</div>

			{#if status.active && showTokens && status.joinTokens}
				<div class="grid sm:grid-cols-2 gap-3 pt-2 border-t">
					{#each [['worker', status.joinTokens.worker], ['manager', status.joinTokens.manager]] as [kind, token]}
						<div class="space-y-1">
							<div class="flex items-center justify-between">
								<span class="text-xs font-medium capitalize">{kind} token</span>
								<Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => copyToken(kind as 'worker' | 'manager', token as string)}>
									{#if copiedToken === kind}<Check class="w-3.5 h-3.5 text-green-500" />{:else}<Copy class="w-3.5 h-3.5" />{/if}
								</Button>
							</div>
							<code class="block text-xs break-all bg-muted p-2 rounded">{token}</code>
						</div>
					{/each}
				</div>
			{/if}

			{#if status.error}
				<p class="text-xs text-destructive">{status.error}</p>
			{/if}
		</div>

		{#if status.active}
			<Tabs.Root value={activeTab} onValueChange={handleTabChange} class="flex-1 min-h-0 flex flex-col">
				<Tabs.List>
					<Tabs.Trigger value="nodes" class="flex items-center gap-1.5"><Server class="w-4 h-4" />Nodes ({nodes.length})</Tabs.Trigger>
					<Tabs.Trigger value="services" class="flex items-center gap-1.5"><Layers class="w-4 h-4" />Services ({services.length})</Tabs.Trigger>
					<Tabs.Trigger value="secrets" class="flex items-center gap-1.5"><KeyRound class="w-4 h-4" />Secrets ({secrets.length})</Tabs.Trigger>
					<Tabs.Trigger value="configs" class="flex items-center gap-1.5"><Sliders class="w-4 h-4" />Configs ({configs.length})</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="nodes" class="flex-1 min-h-0 overflow-y-auto mt-3">
					{#if nodes.length === 0}
						<EmptyState icon={Server} title="No nodes found" description="" />
					{:else}
						<table class="w-full text-sm">
							<thead class="text-left text-muted-foreground border-b">
								<tr><th class="py-2 font-medium">Hostname</th><th class="font-medium">Role</th><th class="font-medium">Availability</th><th class="font-medium">State</th><th class="font-medium">Engine</th><th class="font-medium"></th></tr>
							</thead>
							<tbody>
								{#each nodes as node}
									<tr class="border-b hover:bg-muted/50 cursor-pointer" onclick={() => openNodeInspect(node)}>
										<td class="py-2">
											<div class="flex items-center gap-1.5">{#if node.isLeader}<Crown class="w-3.5 h-3.5 text-amber-500" />{/if}{node.hostname}</div>
											{#if node.labels && Object.keys(node.labels).length > 0}
												<div class="flex flex-wrap gap-1 mt-1">
													{#each Object.entries(node.labels) as [key, value]}
														<span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{key}={value}</span>
													{/each}
												</div>
											{/if}
										</td>
										<td><Badge variant={node.role === 'manager' ? 'default' : 'secondary'}>{node.role}</Badge></td>
										<td><Badge variant={node.availability === 'active' ? 'secondary' : 'destructive'}>{node.availability}</Badge></td>
										<td><Badge variant={node.state === 'ready' ? 'secondary' : 'destructive'}>{node.state}</Badge></td>
										<td class="text-muted-foreground">{node.engineVersion}</td>
										<td class="text-right">
											{#if $canAccess('swarm', 'manage')}
												<div class="flex items-center justify-end gap-1" onclick={(e) => e.stopPropagation()}>
													<Button variant="ghost" size="icon" class="h-7 w-7" title="Edit labels" onclick={() => openNodeLabels(node)}>
														<Tag class="w-4 h-4" />
													</Button>
													<Button variant="ghost" size="icon" class="h-7 w-7" title={node.availability === 'drain' ? 'Activate' : 'Drain'} onclick={() => updateNode(node, { availability: node.availability === 'drain' ? 'active' : 'drain' })}>
														{#if node.availability === 'drain'}<PlayCircle class="w-4 h-4" />{:else}<PauseCircle class="w-4 h-4" />{/if}
													</Button>
													<ConfirmPopover action={node.role === 'manager' ? 'Demote' : 'Promote'} itemType="node" itemName={node.hostname} title="Change role" onConfirm={() => updateNode(node, { role: node.role === 'manager' ? 'worker' : 'manager' })}>
														{#snippet children({ open })}
															<Button variant="ghost" size="icon" class="h-7 w-7 {open ? 'text-primary' : ''}" title={node.role === 'manager' ? 'Demote to worker' : 'Promote to manager'}>
																{#if node.role === 'manager'}<ArrowDownCircle class="w-4 h-4" />{:else}<ArrowUpCircle class="w-4 h-4" />{/if}
															</Button>
														{/snippet}
													</ConfirmPopover>
													{#if $canAccess('swarm', 'delete')}
														<ConfirmPopover action="Remove" itemType="node" itemName={node.hostname} title="Remove" onConfirm={() => removeNode(node)}>
															{#snippet children({ open })}
																<Button variant="ghost" size="icon" class="h-7 w-7 {open ? 'text-destructive' : ''}">
																	<Trash2 class="w-4 h-4" />
																</Button>
															{/snippet}
														</ConfirmPopover>
													{/if}
												</div>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="services" class="flex-1 min-h-0 overflow-y-auto mt-3">
					<div class="flex justify-end mb-2">
						{#if $canAccess('swarm', 'create')}
							<Button size="sm" onclick={() => showCreateService = true}><Plus class="w-4 h-4 mr-1.5" />Create service</Button>
						{/if}
					</div>
					{#if services.length === 0}
						<EmptyState icon={Layers} title="No services found" description="Create a service to run on the cluster" />
					{:else}
						<table class="w-full text-sm">
							<thead class="text-left text-muted-foreground border-b">
								<tr><th class="py-2 font-medium">Name</th><th class="font-medium">Image</th><th class="font-medium">Mode</th><th class="font-medium">Replicas</th><th class="font-medium"></th></tr>
							</thead>
							<tbody>
								{#each services as service}
									{@const traefikUrls = $appSettings.honorProxyLabels ? extractTraefikUrls(service.labels) : []}
									<tr class="border-b hover:bg-muted/50 cursor-pointer" onclick={() => openServiceInspect(service)}>
										<td class="py-2">
											<div>{service.name}</div>
											{#if traefikUrls.length > 0}
												<div class="flex flex-wrap gap-1 mt-1">
													{#each traefikUrls as t}
														<a
															href={t.url}
															target="_blank"
															rel="noopener noreferrer"
															onclick={(e) => e.stopPropagation()}
															class="inline-flex items-center gap-0.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary px-1 py-0.5 rounded transition-colors shrink-0"
															title="Traefik router {t.router} → {t.url}"
														>
															<Globe class="w-2.5 h-2.5" />
															<span class="max-w-[160px] truncate">{t.url.replace(/^https?:\/\//, '')}</span>
															<ExternalLink class="w-2.5 h-2.5 opacity-60" />
														</a>
													{/each}
												</div>
											{/if}
										</td>
										<td class="text-muted-foreground truncate max-w-[240px]">{service.image}</td>
										<td><Badge variant="secondary">{service.mode}</Badge></td>
										<td>{service.replicas ?? '—'}</td>
										<td class="text-right">
											<div class="flex items-center justify-end gap-1" onclick={(e) => e.stopPropagation()}>
												<Button variant="ghost" size="icon" class="h-7 w-7" title="Logs" onclick={() => openServiceLogs(service)}>
													<ScrollText class="w-4 h-4" />
												</Button>
												<Button variant="ghost" size="icon" class="h-7 w-7" title="Inspect" onclick={() => openServiceInspect(service)}>
													<Eye class="w-4 h-4" />
												</Button>
												{#if $canAccess('swarm', 'delete')}
													<ConfirmPopover action="Remove" itemType="service" itemName={service.name} title="Remove" onConfirm={() => removeService(service)}>
														{#snippet children({ open })}
															<Button variant="ghost" size="icon" class="h-7 w-7 {open ? 'text-destructive' : ''}">
																<Trash2 class="w-4 h-4" />
															</Button>
														{/snippet}
													</ConfirmPopover>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="secrets" class="flex-1 min-h-0 overflow-y-auto mt-3">
					<div class="flex justify-end mb-2">
						{#if $canAccess('swarm', 'create')}
							<Button size="sm" onclick={() => showCreateSecret = true}><Plus class="w-4 h-4 mr-1.5" />Create secret</Button>
						{/if}
					</div>
					{#if secrets.length === 0}
						<EmptyState icon={KeyRound} title="No secrets found" description="" />
					{:else}
						<table class="w-full text-sm">
							<thead class="text-left text-muted-foreground border-b">
								<tr><th class="py-2 font-medium">Name</th><th class="font-medium">Created</th><th class="font-medium"></th></tr>
							</thead>
							<tbody>
								{#each secrets as secret}
									<tr class="border-b hover:bg-muted/50">
										<td class="py-2">{secret.name}</td>
										<td class="text-muted-foreground">{formatDateTime(secret.createdAt)}</td>
										<td class="text-right">
											{#if $canAccess('swarm', 'delete')}
												<ConfirmPopover action="Remove" itemType="secret" itemName={secret.name} title="Remove" onConfirm={() => removeSecret(secret)}>
													{#snippet children({ open })}
														<Button variant="ghost" size="icon" class="h-7 w-7 {open ? 'text-destructive' : ''}">
															<Trash2 class="w-4 h-4" />
														</Button>
													{/snippet}
												</ConfirmPopover>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</Tabs.Content>

				<Tabs.Content value="configs" class="flex-1 min-h-0 overflow-y-auto mt-3">
					<div class="flex justify-end mb-2">
						{#if $canAccess('swarm', 'create')}
							<Button size="sm" onclick={() => showCreateConfig = true}><Plus class="w-4 h-4 mr-1.5" />Create config</Button>
						{/if}
					</div>
					{#if configs.length === 0}
						<EmptyState icon={Sliders} title="No configs found" description="" />
					{:else}
						<table class="w-full text-sm">
							<thead class="text-left text-muted-foreground border-b">
								<tr><th class="py-2 font-medium">Name</th><th class="font-medium">Created</th><th class="font-medium"></th></tr>
							</thead>
							<tbody>
								{#each configs as config}
									<tr class="border-b hover:bg-muted/50">
										<td class="py-2">{config.name}</td>
										<td class="text-muted-foreground">{formatDateTime(config.createdAt)}</td>
										<td class="text-right">
											{#if $canAccess('swarm', 'delete')}
												<ConfirmPopover action="Remove" itemType="config" itemName={config.name} title="Remove" onConfirm={() => removeConfig(config)}>
													{#snippet children({ open })}
														<Button variant="ghost" size="icon" class="h-7 w-7 {open ? 'text-destructive' : ''}">
															<Trash2 class="w-4 h-4" />
														</Button>
													{/snippet}
												</ConfirmPopover>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		{/if}
	{/if}
</div>

<InitSwarmModal bind:open={showInitModal} onClose={() => showInitModal = false} onSuccess={fetchStatus} />
<JoinSwarmModal bind:open={showJoinModal} onClose={() => showJoinModal = false} onSuccess={fetchStatus} />
<NodeInspectModal bind:open={showNodeInspect} nodeId={inspectNodeId} nodeName={inspectNodeName} />
<NodeLabelsModal bind:open={showNodeLabels} node={editLabelsNode} onClose={() => showNodeLabels = false} onSuccess={fetchTabData} />
<ServiceInspectModal bind:open={showServiceInspect} serviceId={inspectServiceId} serviceName={inspectServiceName} />
<ServiceLogsModal bind:open={showServiceLogs} serviceId={inspectServiceId} serviceName={inspectServiceName} />
<CreateServiceModal bind:open={showCreateService} onClose={() => showCreateService = false} onSuccess={fetchTabData} />
<CreateSecretModal bind:open={showCreateSecret} onClose={() => showCreateSecret = false} onSuccess={fetchTabData} />
<CreateConfigModal bind:open={showCreateConfig} onClose={() => showCreateConfig = false} onSuccess={fetchTabData} />
