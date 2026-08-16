import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServiceLogs, EnvironmentNotFoundError, DockerConnectionError } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { validateDockerIdParam } from '$lib/server/docker-validation';

export const GET: RequestHandler = async ({ url, params, cookies }) => {
	const invalid = validateDockerIdParam(params.id!, 'service');
	if (invalid) return invalid;

	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;
	const tailParam = url.searchParams.get('tail');
	const tail: number | 'all' = tailParam === 'all' ? 'all' : tailParam ? parseInt(tailParam) : 100;
	const since = url.searchParams.get('since') || undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'view', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		const logs = await getServiceLogs(params.id!, tail, envIdNum, since);
		return json({ logs });
	} catch (error: any) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to get swarm service logs:', error);
		}
		return json({
			error: 'Failed to get swarm service logs',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
