import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listTasks, EnvironmentNotFoundError, DockerConnectionError } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;
	const serviceId = url.searchParams.get('service');
	const nodeId = url.searchParams.get('node');

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
		const filters: Record<string, string[]> = {};
		if (serviceId) filters.service = [serviceId];
		if (nodeId) filters.node = [nodeId];

		const tasks = await listTasks(Object.keys(filters).length ? filters : undefined, envIdNum);
		return json(tasks);
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to list swarm tasks:', error);
		}
		return json({ error: 'Failed to list swarm tasks' }, { status: 500 });
	}
};
