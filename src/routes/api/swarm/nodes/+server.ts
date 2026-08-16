import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listNodes, EnvironmentNotFoundError, DockerConnectionError } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';

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
		return json([]);
	}

	try {
		const nodes = await listNodes(envIdNum);
		return json(nodes);
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to list swarm nodes:', error);
		}
		return json({ error: 'Failed to list swarm nodes' }, { status: 500 });
	}
};
