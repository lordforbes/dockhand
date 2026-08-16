import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getSwarmStatus,
	getSwarmJoinTokens,
	initSwarm,
	EnvironmentNotFoundError,
	DockerConnectionError,
	type SwarmInitOptions
} from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditSwarm } from '$lib/server/audit';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'view', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	if (!envIdNum) {
		return json({ active: false, isManager: false, nodeId: null, nodeAddr: null, error: null, managers: 0, nodes: 0, clusterId: null });
	}

	try {
		const status = await getSwarmStatus(envIdNum);

		// Join tokens grant cluster-join capability, so only attach them for callers who
		// can actually use them (swarm:manage) and only once there's a cluster to join.
		let joinTokens: { worker: string; manager: string } | undefined;
		if (status.active && status.isManager && (!auth.authEnabled || await auth.can('swarm', 'manage', envIdNum))) {
			try {
				joinTokens = await getSwarmJoinTokens(envIdNum);
			} catch {
				// Best-effort: status is still useful without tokens
			}
		}

		return json({ ...status, joinTokens });
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to get swarm status:', error);
		}
		return json({ error: 'Failed to get swarm status' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { url, request, cookies } = event;
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'manage', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	if (!envIdNum) {
		return json({ error: 'Environment is required' }, { status: 400 });
	}

	try {
		const body = await request.json();

		if (!body.advertiseAddr) {
			return json({ error: 'advertiseAddr is required' }, { status: 400 });
		}

		const options: SwarmInitOptions = {
			advertiseAddr: body.advertiseAddr,
			listenAddr: body.listenAddr,
			dataPathAddr: body.dataPathAddr,
			forceNewCluster: body.forceNewCluster || false
		};

		const nodeId = await initSwarm(options, envIdNum);

		await auditSwarm(event, 'create', envIdNum, { advertiseAddr: options.advertiseAddr });

		return json({ success: true, nodeId });
	} catch (error: any) {
		console.error('Failed to init swarm:', error);
		return json({
			error: 'Failed to init swarm',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
