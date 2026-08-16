import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { joinSwarm, EnvironmentNotFoundError, DockerConnectionError, type SwarmJoinOptions } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditSwarm } from '$lib/server/audit';

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

		if (!body.remoteAddrs || !body.joinToken) {
			return json({ error: 'remoteAddrs and joinToken are required' }, { status: 400 });
		}

		const options: SwarmJoinOptions = {
			remoteAddrs: Array.isArray(body.remoteAddrs) ? body.remoteAddrs : [body.remoteAddrs],
			joinToken: body.joinToken,
			listenAddr: body.listenAddr,
			advertiseAddr: body.advertiseAddr
		};

		await joinSwarm(options, envIdNum);

		await auditSwarm(event, 'join', envIdNum, { remoteAddrs: options.remoteAddrs });

		return json({ success: true });
	} catch (error: any) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to join swarm:', error);
		}
		return json({
			error: 'Failed to join swarm',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
